// Serves the client's production build the way Vercel does, so the browser tests run against
// what ships: the same response headers (read from client/vercel.json, including the
// Content-Security-Policy), the SPA fallback to index.html, and /api/auth/* + invite accept
// forwarded to the API like client/middleware.js does (so the refresh cookie is first-party).
//   node serve-dist.js <port> <apiOrigin>
const http = require('http')
const fs = require('fs')
const path = require('path')

const [port, apiOrigin] = process.argv.slice(2)
const DIST = path.join(__dirname, '..', 'client', 'dist')
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'client', 'vercel.json'), 'utf8'))
// Vercel's "source" patterns used here are plain regular expressions over the path.
// The only change from production: the policy allows the local test API instead of the real one.
const PROD_API = 'class-arena-server.onrender.com'
const local = new URL(apiOrigin)
const localize = (value) => value.replaceAll(`https://${PROD_API}`, local.origin).replaceAll(`wss://${PROD_API}`, `ws://${local.host}`)
const headerRules = config.headers.map((rule) => ({
  pattern: new RegExp(`^${rule.source}$`),
  headers: rule.headers.map(({ key, value }) => ({ key, value: localize(value) })),
}))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' }
const proxied = (pathname) => pathname.startsWith('/api/auth/') || pathname === '/api/invites/accept'

function proxy(req, res) {
  const target = new URL(req.url, apiOrigin)
  const upstream = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host, 'x-client-ip': req.socket.remoteAddress } }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers)
    answer.pipe(res)
  })
  upstream.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(upstream)
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  if (proxied(pathname)) return proxy(req, res)

  for (const rule of headerRules) {
    if (rule.pattern.test(pathname)) for (const { key, value } of rule.headers) res.setHeader(key, value)
  }
  let file = path.join(DIST, decodeURIComponent(pathname))
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(Number(port), () => console.log(`client build on http://localhost:${port}`))
