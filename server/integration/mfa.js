// Two-factor login settings: setup with the password, enabling with a real TOTP code, recovery
// codes, secrets encrypted at rest and never returned, no code reuse, limits, turning it off.
const User = require('../models/User')
const totp = require('../lib/totp')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'MFA', name: 'Admin', email: `mfa-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'mfa-t-')
  const mfa = (path, body, token = T.accessToken) => call('POST', `/api/auth/mfa${path}`, body, token)
  const nextStep = (secret) => totp.generate(secret, Date.now() + 30_000) // the following 30-second code

  const status = (await call('GET', '/api/auth/mfa', null, T.accessToken)).d
  check('2FA starts off and is available', status.enabled === false && status.available === true, status)
  check('setup needs the password', (await mfa('/setup', {})).s === 400 && (await mfa('/setup', { password: 'Wrong-pass1!' })).s === 400, null)
  const setup = (await mfa('/setup', { password: PW })).d
  check('setup returns a secret and an otpauth link for the app', /^[A-Z2-7]{32}$/.test(setup.secret) && setup.otpauthUrl.startsWith('otpauth://totp/ClassArena') && setup.otpauthUrl.includes(encodeURIComponent(`mfa-t-${run}@example.com`)), setup)
  check('...but 2FA is not on until a code proves the app works', (await call('GET', '/api/auth/mfa', null, T.accessToken)).d.enabled === false, null)

  check('a wrong code does not turn it on', (await mfa('/enable', { code: '000000' })).s === 400, null)
  const firstCode = totp.generate(setup.secret)
  const enabled = await mfa('/enable', { code: firstCode })
  const codes = enabled.d.recoveryCodes || []
  check('the current code turns it on and returns 10 one-time recovery codes', enabled.s === 200 && codes.length === 10 && new Set(codes).size === 10 && codes.every((c) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c)), enabled.d)

  const stored = await User.findById(T.user.id).lean()
  check('the secret is stored encrypted, not as plain text', stored.mfa.secret.startsWith('v1.') && !stored.mfa.secret.includes(setup.secret) && stored.mfa.pendingSecret === null, stored.mfa.secret.slice(0, 10))
  check('recovery codes are stored only as hashes', stored.mfa.recoveryCodes.length === 10 && !stored.mfa.recoveryCodes.includes(codes[0]) && stored.mfa.recoveryCodes.every((h) => /^[0-9a-f]{64}$/.test(h)), null)

  const members = JSON.stringify((await call('GET', '/api/members', null, A.accessToken)).d)
  const me = (await call('GET', '/api/members', null, A.accessToken)).d.find((m) => m._id === T.user.id)
  check('the member list shows "2FA on" but never secrets or code hashes', me.mfaEnabled === true && !/secret|recoveryCodes|passwordHash|lastStep/.test(members), Object.keys(me))
  check('setup again while on is refused', (await mfa('/setup', { password: PW })).s === 409, null)

  const replay = await mfa('/recovery-codes', { code: firstCode })
  check('the code already used to turn it on cannot be used again (no replay)', replay.s === 400, replay.d)
  const fresh = await mfa('/recovery-codes', { code: nextStep(setup.secret) })
  const newCodes = fresh.d.recoveryCodes || []
  check('new recovery codes replace the old ones', fresh.s === 200 && newCodes.length === 10 && !newCodes.includes(codes[0]), fresh.d)

  check('turning it off needs the password', (await mfa('/disable', { password: 'Wrong-pass1!', code: newCodes[0] })).s === 400, null)
  check('an old recovery code no longer works', (await mfa('/disable', { password: PW, code: codes[0] })).s === 400, null)
  const off = await mfa('/disable', { password: PW, code: newCodes[0] })
  const after = await User.findById(T.user.id).lean()
  check('a current recovery code turns it off and wipes the secret and codes', off.s === 200 && after.mfa.enabled === false && after.mfa.secret === null && after.mfa.recoveryCodes.length === 0, after.mfa)

  // Wrong codes are rate-limited per user (rate limits are off in this API instance, so this
  // only checks the response stays a plain refusal; the limit itself is covered in rateLimits).
  check('wrong codes are refused with a plain message', (await mfa('/enable', { code: '123456' })).s === 400, null)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
