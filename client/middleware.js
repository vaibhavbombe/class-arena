// Vercel Routing Middleware (runs on Vercel only; `vite dev` ignores it).
//
// The browser calls /api/auth/* (login, refresh, logout, signups) and /api/invites/accept on
// this site, so the refresh-token cookie the API sets is first-party here; Safari and other
// browsers block third-party cookies. This forwards those requests to the API and adds:
//   x-client-ip     the visitor's IP as Vercel saw it (Vercel sets x-real-ip itself)
//   x-proxy-secret  a secret shared with the API, which only then believes x-client-ip
// Both values come from Vercel's environment settings: PROXY_SECRET (and API_ORIGIN, optional).
export const config = { matcher: ['/api/auth/:path*', '/api/invites/accept'] }

const API_ORIGIN = process.env.API_ORIGIN || 'https://class-arena-server.onrender.com'

export default async function middleware(request) {
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('accept-encoding') // ask for an uncompressed body; it's passed straight through
  headers.set('x-proxy-secret', process.env.PROXY_SECRET || '')
  headers.set('x-client-ip', request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim())

  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer()

  const upstream = await fetch(API_ORIGIN + url.pathname + url.search, init)
  // fetch has already decoded the body, so these would no longer be true.
  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
