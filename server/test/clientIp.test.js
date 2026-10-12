const test = require('node:test')
const assert = require('node:assert/strict')

// The secret is read when the module loads, so each case loads a fresh copy.
function load(secret) {
  if (secret === undefined) delete process.env.PROXY_SECRET
  else process.env.PROXY_SECRET = secret
  delete require.cache[require.resolve('../lib/clientIp')]
  return require('../lib/clientIp')
}
const request = (headers) => ({ ip: '10.0.0.1', headers })

test('without a configured secret, forwarded client IPs are never believed', () => {
  const { clientIp } = load(undefined)
  assert.equal(clientIp(request({ 'x-proxy-secret': '', 'x-client-ip': '203.0.113.5' })), '10.0.0.1')
})

test('with the right secret, the forwarded client IP is used', () => {
  const { clientIp } = load('s3cret-value-123')
  assert.equal(clientIp(request({ 'x-proxy-secret': 's3cret-value-123', 'x-client-ip': '203.0.113.5' })), '203.0.113.5')
  assert.equal(clientIp(request({ 'x-proxy-secret': 's3cret-value-123', 'x-client-ip': '2001:db8::1' })), '2001:db8::1')
})

test('a wrong, missing or differently sized secret falls back to req.ip', () => {
  const { clientIp } = load('s3cret-value-123')
  assert.equal(clientIp(request({ 'x-proxy-secret': 's3cret-value-124', 'x-client-ip': '203.0.113.5' })), '10.0.0.1')
  assert.equal(clientIp(request({ 'x-client-ip': '203.0.113.5' })), '10.0.0.1')
  assert.equal(clientIp(request({ 'x-proxy-secret': 'short', 'x-client-ip': '203.0.113.5' })), '10.0.0.1')
})

test('a forwarded value that is not an IP address is ignored', () => {
  const { clientIp } = load('s3cret-value-123')
  assert.equal(clientIp(request({ 'x-proxy-secret': 's3cret-value-123', 'x-client-ip': 'evil, 1.2.3.4' })), '10.0.0.1')
  delete process.env.PROXY_SECRET
})
