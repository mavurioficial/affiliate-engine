import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = process.argv[2] ?? '.'
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
createServer((request, response) => {
  const pathname = request.url === '/' ? '/index.html' : request.url.split('?')[0]
  const file = join(root, normalize(pathname).replace(/^([.][.][/\\])+/, ''))
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end('Not found'); return }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(5173, () => console.log(`Mavuri Affiliate Engine disponível em http://localhost:5173 (${root})`))

