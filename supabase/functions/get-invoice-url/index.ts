import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.110.8/cors'

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: jsonHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 2048) {
    return json({ error: 'Invalid request' }, 413)
  }

  try {
    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string'
      ? body.token.trim().toLowerCase()
      : ''

    if (!/^[a-f0-9]{64}$/.test(token)) {
      return json({ error: 'Invalid invoice link' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Required Supabase environment variables are missing')
      return json({ error: 'Service unavailable' }, 503)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data: invoice, error: lookupError } = await adminClient
      .from('invoices')
      .select('invoice_number, file_path')
      .eq('secure_token', token)
      .eq('is_enabled', true)
      .maybeSingle()

    if (lookupError) {
      console.error('Invoice lookup failed:', lookupError.message)
      return json({ error: 'Service unavailable' }, 503)
    }

    if (!invoice?.file_path) {
      return json({ error: 'Invoice not found' }, 404)
    }

    const { data: signedData, error: signedUrlError } = await adminClient.storage
      .from('invoices')
      .createSignedUrl(invoice.file_path, 600)

    if (signedUrlError || !signedData?.signedUrl) {
      console.error('Signed invoice URL creation failed:', signedUrlError?.message || 'missing_url')
      return json({ error: 'Service unavailable' }, 503)
    }

    return json({
      url: signedData.signedUrl,
      invoice_number: invoice.invoice_number,
      expires_in: 600,
    })
  } catch (error) {
    console.error('Unexpected invoice function failure:', error instanceof Error ? error.message : 'unknown_error')
    return json({ error: 'Service unavailable' }, 503)
  }
})
