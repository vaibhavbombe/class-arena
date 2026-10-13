const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
const { signAccessToken, signMfaToken, verifyMfaToken } = require('../lib/tokens')

const user = { _id: 'u1', institutionId: 'i1', role: 'teacher' }

test('the halfway login token round-trips to the user id', () => {
  assert.equal(verifyMfaToken(signMfaToken(user)), 'u1')
})

test('it cannot pass as an access token, and an access token cannot pass as it', () => {
  assert.throws(() => jwt.verify(signMfaToken(user), process.env.JWT_ACCESS_SECRET))
  assert.equal(verifyMfaToken(signAccessToken(user)), null)
})

test('expired, tampered or missing tokens give null', () => {
  const expired = jwt.sign({ userId: 'u1', purpose: 'mfa-login', exp: Math.floor(Date.now() / 1000) - 10 },
    require('crypto').createHmac('sha256', 'test-access-secret').update('classarena:mfa-login').digest())
  assert.equal(verifyMfaToken(expired), null)
  assert.equal(verifyMfaToken(signMfaToken(user).slice(0, -2) + 'xx'), null)
  assert.equal(verifyMfaToken(undefined), null)
})
