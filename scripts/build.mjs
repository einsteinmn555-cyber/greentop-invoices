import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist')
const pdfjsSource = join(root, 'node_modules', 'pdfjs-dist')
const pdfjsOutput = join(output, 'vendor', 'pdfjs', '5.4.624')

const files = [
  'index.html',
  'admin.html',
  'config.js',
  '_headers',
  '_redirects',
  'robots.txt',
]

const directories = ['assets', 'css', 'js']

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await mkdir(pdfjsOutput, { recursive: true })

await Promise.all([
  ...files.map((file) => cp(join(root, file), join(output, file))),
  ...directories.map((directory) => cp(
    join(root, directory),
    join(output, directory),
    { recursive: true }
  )),
  cp(join(pdfjsSource, 'legacy', 'build', 'pdf.min.mjs'), join(pdfjsOutput, 'pdf.min.mjs')),
  cp(join(pdfjsSource, 'legacy', 'build', 'pdf.worker.min.mjs'), join(pdfjsOutput, 'pdf.worker.min.mjs')),
  cp(join(pdfjsSource, 'cmaps'), join(pdfjsOutput, 'cmaps'), { recursive: true }),
  cp(join(pdfjsSource, 'standard_fonts'), join(pdfjsOutput, 'standard_fonts'), { recursive: true }),
  cp(join(pdfjsSource, 'wasm'), join(pdfjsOutput, 'wasm'), { recursive: true }),
  cp(join(pdfjsSource, 'LICENSE'), join(pdfjsOutput, 'LICENSE')),
])

console.log('Cloudflare output is ready in dist/')
