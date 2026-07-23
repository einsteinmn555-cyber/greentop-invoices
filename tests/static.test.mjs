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

test('customer PDFs render inside the page with a local PDF.js worker', async () => {
  const html = await read('index.html')
  const customer = await read('js/customer-portal.js')
  const headers = await read('_headers')

  assert.match(html, /id="pdf-pages"/)
  assert.doesNotMatch(html, /<iframe/)
  assert.match(customer, /import\(libraryUrl\.href\)/)
  assert.match(customer, /pdfjs\.getDocument/)
  assert.match(customer, /page\.render/)
  assert.match(headers, /worker-src 'self'/)

  await access(new URL('../dist/vendor/pdfjs/5.4.624/pdf.min.mjs', import.meta.url))
  await access(new URL('../dist/vendor/pdfjs/5.4.624/pdf.worker.min.mjs', import.meta.url))
})

test('frontend never contains the Supabase service-role secret', async () => {
  const files = await Promise.all([
    read('config.js'),
    read('js/customer-portal.js'),
    read('js/admin-dashboard.js'),
    read('index.html'),
    read('admin.html'),
    read('review.html'),
    read('reviews-admin.html'),
    read('js/review.js'),
    read('js/reviews-admin.js'),
  ])
  const frontend = files.join('\n').toLowerCase()
  assert.doesNotMatch(frontend, /service_role|service-role|supabase_service_role_key/)
  assert.match(frontend, /sb_publishable_/)
})

test('customer review page has a branded splash, clickable stars, and required phone', async () => {
  const html = await read('review.html')
  const script = await read('js/review.js')
  const redirects = await read('_redirects')
  assert.match(html, /id="review-splash"/)
  assert.match(html, /assets\/green-top-logo\.webp/)
  assert.match(html, /id="phone"[\s\S]*required/)
  assert.match(html, /data-rating="overall_rating"/)
  assert.match(script, /className = 'star-button'/)
  assert.match(script, /submit_customer_review/)
  assert.doesNotMatch(redirects, /^\/review /m)
})

test('reviews stay private and are readable only by the Green Top admin', async () => {
  const sql = await read('supabase/migrations/202607220003_customer_reviews.sql')
  const admin = await read('js/reviews-admin.js')
  assert.match(sql, /alter table public\.customer_reviews force row level security/i)
  assert.match(sql, /as restrictive[\s\S]*public\.is_green_top_admin\(\)/i)
  assert.match(sql, /revoke all on table public\.customer_reviews from anon/i)
  assert.match(sql, /security definer[\s\S]*submit_customer_review|submit_customer_review[\s\S]*security definer/i)
  assert.match(admin, /from\('customer_reviews'\)/)
  assert.match(admin, /ADMIN_EMAIL/)
  assert.match(admin, /data-review-id/)
  assert.match(admin, /openReviewDetails/)
  assert.match(admin, /ملاحظات العميل وتوصياته/)
})

test('legacy tokens and compact codes are strong and validated at both layers', async () => {
  const admin = await read('js/admin-dashboard.js')
  const customer = await read('js/customer-portal.js')
  const edgeFunction = await read('supabase/functions/get-invoice-url/index.ts')
  const migration = await read('supabase/migrations/202607220002_short_invoice_links.sql')
  assert.match(admin, /new Uint8Array\(32\)/)
  assert.match(admin, /new Uint8Array\(12\)/)
  assert.match(customer, /\^\[a-f0-9\]\{64\}\$/)
  assert.match(customer, /\^\[A-Za-z0-9_-\]\{16\}\$/)
  assert.match(edgeFunction, /\^\[a-f0-9\]\{64\}\$/)
  assert.match(edgeFunction, /\^\[A-Za-z0-9_-\]\{16\}\$/)
  assert.match(migration, /create unique index if not exists invoices_short_code_unique/i)
  assert.match(migration, /alter column short_code set not null/i)
})

test('admin creates branded short links and keeps legacy links as a fallback', async () => {
  const admin = await read('js/admin-dashboard.js')
  const config = await read('config.js')
  assert.match(config, /CUSTOMER_PORTAL_ORIGIN: 'https:\/\/greentop-invoices\.pages\.dev'/)
  assert.match(admin, /new URL\(`\/i\/\$\{shortCode\}`/)
  assert.match(admin, /new URL\('\/', window\.location\.origin\)/)
  assert.match(admin, /🧾 فواتير جرين توب/)
  assert.match(admin, /نسخ لواتساب/)
})

test('customer portal routes compact paths to the same invoice page', async () => {
  const html = await read('index.html')
  const redirects = await read('_redirects')
  const buildScript = await read('scripts/build.mjs')
  const customer = await read('js/customer-portal.js')
  assert.match(redirects, /^\/i\/\* \/index\.html 200/m)
  assert.match(buildScript, /'_redirects'/)
  assert.match(customer, /window\.location\.pathname\.match/)
  assert.match(customer, /\{ code: this\.shortCode \}/)
  assert.match(html, /href="\/css\/style\.css/)
  assert.match(html, /src="\/assets\/green-top-logo\.webp"/)
  assert.match(html, /src="\/config\.js"/)
  assert.match(html, /src="\/js\/customer-portal\.js/)
  assert.doesNotMatch(html, /(?:src|href)="(?:assets|css|config\.js|js\/)/)
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

test('Cloudflare build publishes invoice and customer-review pages only', async () => {
  const buildScript = await read('scripts/build.mjs')
  assert.match(buildScript, /const output = join\(root, 'dist'\)/)
  assert.doesNotMatch(buildScript, /supabase|tests|README/)
  await access(new URL('../assets/green-top-logo.webp', import.meta.url))
  await access(new URL('../dist/_redirects', import.meta.url))
  await access(new URL('../dist/review/index.html', import.meta.url))
  await access(new URL('../dist/reviews-admin/index.html', import.meta.url))
})
