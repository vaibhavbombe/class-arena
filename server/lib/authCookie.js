// The refresh token lives only in an httpOnly cookie: page scripts (including injected ones)
// can't read it. SameSite=Strict keeps other sites from sending it, and Path=/api/auth means
// the browser only attaches it to auth requests.
//
// In production the browser reaches /api/auth/* through the client's own domain (a Vercel
// rewrite to the API), so this is a first-party cookie there; third-party cookies are blocked
// by Safari and others. Locally, localhost:5178 and localhost:5002 count as the same site.
const COOKIE = 'ca_rt'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // same as the refresh token itself

const options = () => ({
  httpOnly: true,
  // Browsers drop Secure cookies over plain http, so only require HTTPS where it exists.
  secure: Boolean(process.env.RENDER) || process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict',
  path: '/api/auth',
})

function setRefreshCookie(res, token) {
  res.cookie(COOKIE, token, { ...options(), maxAge: MAX_AGE_MS })
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE, options())
}

function readRefreshCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

module.exports = { COOKIE, setRefreshCookie, clearRefreshCookie, readRefreshCookie }
