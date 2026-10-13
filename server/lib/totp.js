const crypto = require('crypto')

// Time-based one-time passwords (TOTP, RFC 6238), the codes authenticator apps show.
// Implemented from the RFC instead of adding a dependency; test/totp.test.js checks it against
// the RFC's own test vectors. HMAC-SHA1, 30-second steps, 6 digits: what every app supports.

const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' // base32 (RFC 4648), how apps exchange secrets

function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base32 secret')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// A new random secret: 20 bytes (160 bits), as RFC 4226 recommends for HMAC-SHA1.
const generateSecret = () => base32Encode(crypto.randomBytes(20))

// HOTP (RFC 4226): HMAC the 8-byte counter, then "dynamic truncation" to a number.
function hotp(secretBuffer, counter, digits = DIGITS) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', secretBuffer).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const number = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(number % 10 ** digits).padStart(digits, '0')
}

const counterAt = (timeMs) => Math.floor(timeMs / 1000 / STEP_SECONDS)

function generate(secret, timeMs = Date.now(), digits = DIGITS) {
  return hotp(base32Decode(secret), counterAt(timeMs), digits)
}

/**
 * Checks a 6-digit code, allowing one step of clock drift either way.
 * @returns the matching time-step counter (store it: a code may only be used once), or null
 */
function verify(secret, code, { timeMs = Date.now(), window = 1, afterCounter = -1 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null
  const key = base32Decode(secret)
  const now = counterAt(timeMs)
  for (let counter = now - window; counter <= now + window; counter++) {
    if (counter <= afterCounter) continue // already used: no replays
    const expected = Buffer.from(hotp(key, counter))
    if (crypto.timingSafeEqual(expected, Buffer.from(code.trim()))) return counter
  }
  return null
}

// The link authenticator apps read from a QR code.
function otpauthUrl({ secret, account, issuer = 'ClassArena' }) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

module.exports = { base32Encode, base32Decode, generateSecret, hotp, generate, verify, otpauthUrl, STEP_SECONDS }
