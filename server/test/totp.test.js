const test = require('node:test')
const assert = require('node:assert/strict')
const totp = require('../lib/totp')

// RFC 6238 Appendix B (SHA1): secret is the ASCII "12345678901234567890", 8-digit codes.
const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'))
const RFC_VECTORS = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
]

test('matches the RFC 6238 test vectors', () => {
  for (const [seconds, expected] of RFC_VECTORS) assert.equal(totp.generate(RFC_SECRET, seconds * 1000, 8), expected, `T=${seconds}`)
})

test('matches the RFC 4226 HOTP test vectors (the building block)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
  const key = Buffer.from('12345678901234567890', 'ascii')
  expected.forEach((code, counter) => assert.equal(totp.hotp(key, counter), code))
})

test('base32 round-trips and generated secrets are 160 bits', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 128])
  assert.deepEqual(totp.base32Decode(totp.base32Encode(bytes)), bytes)
  assert.equal(totp.base32Decode(totp.generateSecret()).length, 20)
  assert.deepEqual(totp.base32Decode('gezd gnbv'), totp.base32Decode('GEZDGNBV')) // spaces and lower case are fine
  assert.throws(() => totp.base32Decode('not valid!'), /Invalid base32/)
})

test('verify: accepts the current code and one step of drift, nothing further', () => {
  const secret = totp.generateSecret()
  const now = 1_700_000_000_000
  const code = (offsetSteps) => totp.generate(secret, now + offsetSteps * 30_000)
  assert.ok(totp.verify(secret, code(0), { timeMs: now }) !== null)
  assert.ok(totp.verify(secret, code(-1), { timeMs: now }) !== null)
  assert.ok(totp.verify(secret, code(1), { timeMs: now }) !== null)
  assert.equal(totp.verify(secret, code(-3), { timeMs: now }), null)
  assert.equal(totp.verify(secret, '12345', { timeMs: now }), null) // wrong length
  assert.equal(totp.verify(secret, 'abcdef', { timeMs: now }), null)
})

test('verify: a code whose time step was already used is refused (no replay)', () => {
  const secret = totp.generateSecret()
  const now = 1_700_000_000_000
  const code = totp.generate(secret, now)
  const counter = totp.verify(secret, code, { timeMs: now })
  assert.equal(totp.verify(secret, code, { timeMs: now, afterCounter: counter }), null)
})

test('otpauth link carries the secret, issuer and account', () => {
  const url = totp.otpauthUrl({ secret: 'ABC', account: 'ana@example.com' })
  assert.equal(url, 'otpauth://totp/ClassArena%3Aana%40example.com?secret=ABC&issuer=ClassArena&algorithm=SHA1&digits=6&period=30')
})
