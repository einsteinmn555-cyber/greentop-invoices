import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('customer page contains only the required main actions', async () => {
  const html = await read('index.html')
  assert.match(html, /id="view-invoice-btn"/)
  assert.match(html, /id="website-btn"/)
  assert.doesNotMatch(html, /tel:|wa\.me|41151818/)
})

test('frontend never contains the Supabase service-role secret', async () => {
  const files = await Promise.all([
    read('config.js'),
    read('js/customer-portal.js'),
    read('js/admin-dashboard.js'),
    read('index.html'),
    read('admin.html'),
  ])
  const frontend = files.join('\n').toLowerCase()
  assert.doesNotMatch(frontend, /service_role|service-role|supabase_service_role_key/)
  assert.match(frontend, /sb_publishable_/)
})

test('customer tokens are strong and validated at both layers', async () => {
  const admin = await read('js/admin-dashboard.js')
  const customer = await read('js/customer-portal.js')
  const edgeFunction = await read('supabase/functions/get-invoice-url/index.ts')
  assert.match(admin, /new Uint8Array\(32\)/)
  assert.match(customer, /\^\[a-f0-9\]\{64\}\$/)
  assert.match(edgeFunction, /\^\[a-f0-9\]\{64\}\$/)
})

test('database and storage have restrictive admin guards', async () => {
  const sql = await read('supabase/migrations/202607220001_secure_invoices.sql')
  assert.match(sql, /alter table public\.invoices force row level security/i)
  assert.match(sql, /as restrictive[\s\S]*public\.is_green_top_admin\(\)/i)
  assert.match(sql, /Green Top storage guard/)
  assert.match(sql, /public\s*=\s*false/i)
})

test('temporary admin password must be changed on first login', async () => {
  const admin = await read('js/admin-dashboard.js')
  assert.match(admin, /must_change_password/)
  assert.match(admin, /auth\.updateUser/)
  assert.match(admin, /password\.length < 12/)
})

test('Cloudflare headers block framing and indexing', async () => {
  const headers = await read('_headers')
  const robots = await read('robots.txt')
  assert.match(headers, /frame-ancestors 'none'/)
  assert.match(headers, /Referrer-Policy: no-referrer/)
  assert.match(headers, /Cache-Control: no-store/)
  assert.match(robots, /Disallow: \//)
})

test('Cloudflare build publishes only the customer and admin site', async () => {
  const buildScript = await read('scripts/build.mjs')
  assert.match(buildScript, /const output = join\(root, 'dist'\)/)
  assert.doesNotMatch(buildScript, /supabase|tests|README/)
  await access(new URL('../assets/green-top-logo.webp', import.meta.url))
})
