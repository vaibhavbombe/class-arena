const crypto = require('crypto')

// Encrypts small secrets (2FA seeds) before they're stored, with AES-256-GCM, so a copy of the
// database alone doesn't reveal them. GCM also detects tampering. Stored as "v1.<iv>.<tag>.<data>".
//
// The key is MFA_ENCRYPTION_KEY (32 random bytes, base64). In production 2FA stays switched off
// until it's set. Locally and in tests a development key is derived, so nothing needs setting up.

function loadKey(env = process.env) {
  if (env.MFA_ENCRYPTION_KEY) {
    const key = Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64')
    if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
    return key
  }
  if (env.RENDER) return null
  return crypto.createHash('sha256').update(`classarena-dev-mfa:${env.JWT_ACCESS_SECRET || 'dev'}`).digest()
}

const KEY = loadKey()
const isConfigured = () => KEY !== null

function encrypt(text, key = KEY) {
  if (!key) throw Object.assign(new Error('Two-factor login is not configured'), { status: 503 })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

function decrypt(box, key = KEY) {
  if (!key) throw Object.assign(new Error('Two-factor login is not configured'), { status: 503 })
  const [version, iv, tag, data] = String(box).split('.')
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unreadable secret')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt, isConfigured, loadKey }
