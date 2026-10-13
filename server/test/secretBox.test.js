const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const box = require('../lib/secretBox')

const key = crypto.randomBytes(32)

test('encrypts and decrypts; the stored form never contains the secret', () => {
  const sealed = box.encrypt('JBSWY3DPEHPK3PXP', key)
  assert.match(sealed, /^v1\./)
  assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'))
  assert.equal(box.decrypt(sealed, key), 'JBSWY3DPEHPK3PXP')
  assert.notEqual(box.encrypt('same', key), box.encrypt('same', key)) // fresh IV each time
})

test('tampering or the wrong key is detected (AES-GCM authentication)', () => {
  const sealed = box.encrypt('secret', key)
  const [v, iv, tag, data] = sealed.split('.')
  const flipped = Buffer.from(data, 'base64')
  flipped[0] ^= 1
  assert.throws(() => box.decrypt([v, iv, tag, flipped.toString('base64')].join('.'), key))
  assert.throws(() => box.decrypt(sealed, crypto.randomBytes(32)))
  assert.throws(() => box.decrypt('garbage', key), /Unreadable/)
})

test('key rules: a 32-byte key is required; production without one switches 2FA off', () => {
  assert.equal(box.loadKey({ MFA_ENCRYPTION_KEY: key.toString('base64') }).length, 32)
  assert.throws(() => box.loadKey({ MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }), /32 bytes/)
  assert.equal(box.loadKey({ RENDER: 'true' }), null)
  assert.equal(box.loadKey({ JWT_ACCESS_SECRET: 'x' }).length, 32) // development fallback
  assert.throws(() => box.encrypt('x', null), /not configured/)
})
