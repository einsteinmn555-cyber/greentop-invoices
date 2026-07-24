const allowedOrigins = new Set([
  'https://greentop-invoices.pages.dev',
  'http://localhost:3000',
  'http://localhost:4173',
])

const htmlReplacements: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  const allowedOrigin = allowedOrigins.has(origin)
    ? origin
    : 'https://greentop-invoices.pages.dev'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function normalizePhone(value: unknown) {
  return String(value || '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/\D/g, '')
}

function cleanName(value: unknown) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => htmlReplacements[character] || character)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed' }, 405)
  }

  const origin = request.headers.get('origin') || ''
  if (origin && !allowedOrigins.has(origin)) {
    return json(request, { error: 'Origin not allowed' }, 403)
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 4096) {
    return json(request, { error: 'Invalid request' }, 413)
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const name = cleanName(body?.name)
    const phone = normalizePhone(body?.phone)
    const website = String(body?.website || '').trim()

    if (website) {
      return json(request, { ok: true })
    }

    if (name.length < 2 || name.length > 80) {
      return json(request, { error: 'Invalid name' }, 400)
    }

    if (phone.length < 8 || phone.length > 15) {
      return json(request, { error: 'Invalid phone' }, 400)
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is missing')
      return json(request, { error: 'Service unavailable' }, 503)
    }

    const submittedAt = new Intl.DateTimeFormat('ar-KW', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'Asia/Kuwait',
    }).format(new Date())

    const safeName = escapeHtml(name)
    const safePhone = escapeHtml(phone)
    const safeTime = escapeHtml(submittedAt)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Green Top Booking <onboarding@resend.dev>',
        to: ['taxigreentop@gmail.com'],
        subject: `طلب حجز تجريبي جديد - ${phone}`,
        text: [
          'طلب حجز تجريبي جديد',
          `الاسم: ${name}`,
          `رقم الهاتف: ${phone}`,
          `وقت الإرسال: ${submittedAt}`,
        ].join('\n'),
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#132218;max-width:620px;margin:auto">
            <h2 style="color:#08783e">طلب حجز تجريبي جديد</h2>
            <p><strong>الاسم:</strong> ${safeName}</p>
            <p><strong>رقم الهاتف:</strong> <span dir="ltr">${safePhone}</span></p>
            <p><strong>وقت الإرسال:</strong> ${safeTime}</p>
            <hr style="border:0;border-top:1px solid #dbe7df">
            <p style="font-size:13px;color:#5f6f64">تم الإرسال من نموذج حجوزات جرين توب.</p>
          </div>
        `,
      }),
    })

    if (!resendResponse.ok) {
      const failure = await resendResponse.text()
      console.error('Resend request failed:', resendResponse.status, failure.slice(0, 500))
      return json(request, { error: 'Notification failed' }, 502)
    }

    return json(request, { ok: true })
  } catch (error) {
    console.error('Unexpected booking notification failure:', error instanceof Error ? error.message : 'unknown_error')
    return json(request, { error: 'Service unavailable' }, 503)
  }
})
