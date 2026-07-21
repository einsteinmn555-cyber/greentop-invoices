import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist')

const files = [
  'index.html',
  'admin.html',
  'config.js',
  '_headers',
  'robots.txt',
]

const directories = ['assets', 'css', 'js']

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

await Promise.all([
  ...files.map((file) => cp(join(root, file), join(output, file))),
  ...directories.map((directory) => cp(
    join(root, directory),
    join(output, directory),
    { recursive: true }
  )),
])

console.log('Cloudflare output is ready in dist/')
