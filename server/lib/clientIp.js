const crypto = require('crypto')
const net = require('net')

// The client's IP for rate limits.
//
// Direct requests: Express's req.ip, with `trust proxy` set to the measured number of Render
// proxy hops (see server.js), so a client can't choose it by sending X-Forwarded-For.
//
// Requests for /api/auth/* come through the client's own domain (so the refresh cookie is
// first-party): a Vercel middleware (client/middleware.js) forwards them and adds the client
// IP that Vercel saw, plus a shared secret. That IP is only believed when the secret matches;
// anyone calling the API directly with made-up headers just gets req.ip.
const SECRET = process.env.PROXY_SECRET || ''

function fromTrustedProxy(req) {
  const given = req.headers['x-proxy-secret']
  if (!SECRET || typeof given !== 'string' || given.length !== SECRET.length) return false
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(SECRET))
}

function clientIp(req) {
  if (fromTrustedProxy(req)) {
    const ip = req.headers['x-client-ip']
    if (typeof ip === 'string' && net.isIP(ip.trim())) return ip.trim()
  }
  return req.ip
}

module.exports = { clientIp, fromTrustedProxy }
