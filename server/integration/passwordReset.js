// Password reset: same answer for any email, cooldown, single-use hashed tokens, sessions revoked.
const crypto = require('crypto')
const PasswordReset = require('../models/PasswordReset')
const User = require('../models/User')
const { run, call, check, connectTestDb, finish } = require('./helpers')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex')

;(async () => {
  await connectTestDb()

  const email = `reset${run}@example.com`
  const signup = await call('POST', '/api/auth/signup', { institutionName: 'Reset Co', name: 'Rita', email, password: 'OldPassw0rd!' })
  const user = await User.findOne({ email })

  const known = await call('POST', '/api/auth/forgot-password', { email })
  const unknown = await call('POST', '/api/auth/forgot-password', { email: `nobody${run}@example.com` })
  check('same answer for existing and unknown email', known.s === 200 && unknown.s === 200 && known.d.message === unknown.d.message, { known, unknown })
  await sleep(1500)
  const stored = await PasswordReset.find({ userId: user._id })
  check('one reset stored, as a 64-char hash with 30 min expiry', stored.length === 1 && /^[a-f0-9]{64}$/.test(stored[0].tokenHash) && Math.abs(stored[0].expiresAt - Date.now() - 30 * 60e3) < 60e3, stored)

  await call('POST', '/api/auth/forgot-password', { email })
  await sleep(1500)
  const afterSecond = await PasswordReset.find({ userId: user._id })
  check('second request within a minute is ignored (cooldown)', afterSecond.length === 1 && String(afterSecond[0]._id) === String(stored[0]._id), afterSecond.length)

  // Plant a reset with a known token, as if we had clicked the emailed link.
  await PasswordReset.deleteMany({ userId: user._id })
  const token = crypto.randomBytes(32).toString('hex')
  await PasswordReset.create({ userId: user._id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 30 * 60e3) })

  const short = await call('POST', '/api/auth/reset-password', { token, password: 'short' })
  check('too-short password rejected (400)', short.s === 400, short)
  const wrong = await call('POST', '/api/auth/reset-password', { token: 'f'.repeat(64), password: 'NewPassw0rd!' })
  check('wrong token rejected (400)', wrong.s === 400, wrong)
  const inj = await call('POST', '/api/auth/reset-password', { token: { $ne: '' }, password: 'NewPassw0rd!' })
  check('object token rejected (NoSQL injection)', inj.s === 400, inj)

  const ok = await call('POST', '/api/auth/reset-password', { token, password: 'NewPassw0rd!' })
  check('valid token resets password', ok.s === 200, ok)
  const reuse = await call('POST', '/api/auth/reset-password', { token, password: 'An0ther!pass' })
  check('token cannot be reused', reuse.s === 400, reuse)

  const oldLogin = await call('POST', '/api/auth/login', { email, password: 'OldPassw0rd!' })
  const newLogin = await call('POST', '/api/auth/login', { email, password: 'NewPassw0rd!' })
  check('old password fails, new password works', oldLogin.s === 401 && newLogin.s === 200, { oldLogin: oldLogin.s, newLogin: newLogin.s })
  const oldSession = await call('POST', '/api/auth/refresh', { refreshToken: signup.d.refreshToken })
  check('sessions from before the reset are signed out', oldSession.s === 401, oldSession)

  const expiredToken = crypto.randomBytes(32).toString('hex')
  await PasswordReset.create({ userId: user._id, tokenHash: hash(expiredToken), expiresAt: new Date(Date.now() - 1000) })
  const expired = await call('POST', '/api/auth/reset-password', { token: expiredToken, password: 'NewPassw0rd!2' })
  check('expired token rejected', expired.s === 400, expired)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
