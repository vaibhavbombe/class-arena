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

  // Logging in with 2FA on: password first, then a code, and only then a session.
  const L = await invite(A.accessToken, 'mfa-login-')
  const lSetup = (await mfa('/setup', { password: PW }, L.accessToken)).d
  const lCodes = (await mfa('/enable', { code: totp.generate(lSetup.secret) }, L.accessToken)).d.recoveryCodes
  const login = () => call('POST', '/api/auth/login', { email: L.user.email, password: PW })
  const step = (body) => call('POST', '/api/auth/login/mfa', body)

  const half = await login()
  check('the password alone gives no session: mfaRequired, no access token, no cookie', half.s === 200 && half.d.mfaRequired === true && typeof half.d.mfaToken === 'string' && !half.d.accessToken && !half.d.user && half.refresh === null, half.d)
  check('a wrong password still gets the usual 401 (no hint that 2FA is on)', (await call('POST', '/api/auth/login', { email: L.user.email, password: 'Wrong-pass1!' })).s === 401, null)
  check('the halfway token is not an access token', (await call('GET', '/api/me', null, half.d.mfaToken)).s === 401, null)
  check('an access token is not a halfway token', (await step({ mfaToken: L.accessToken, code: nextStep(lSetup.secret) })).s === 401, null)
  check('a missing or tampered halfway token is refused', (await step({ code: '123456' })).s === 401 && (await step({ mfaToken: half.d.mfaToken.slice(0, -2) + 'xx', code: '123456' })).s === 401, null)
  check('a wrong code is refused without a session', (await step({ mfaToken: half.d.mfaToken, code: '000000' })).s === 400, null)

  const codeNow = nextStep(lSetup.secret)
  const full = await step({ mfaToken: half.d.mfaToken, code: codeNow })
  check('the right code completes the login: access token, user and the refresh cookie', full.s === 200 && typeof full.d.accessToken === 'string' && full.d.user?.email === L.user.email && full.refresh !== null, full.d)
  check('the new access token works', (await call('GET', '/api/me', null, full.d.accessToken)).s === 200, null)
  check('refresh with the new cookie works (no second code needed)', (await call('POST', '/api/auth/refresh', null, null, { cookie: full.refresh })).s === 200, null)
  check('the same code cannot log in twice (no replay)', (await step({ mfaToken: (await login()).d.mfaToken, code: codeNow })).s === 400, null)

  const byRecovery = await step({ mfaToken: (await login()).d.mfaToken, code: lCodes[0] })
  check('a recovery code logs in and says how many are left', byRecovery.s === 200 && byRecovery.d.accessToken && byRecovery.d.recoveryCodesLeft === 9, byRecovery.d)
  check('...and works only once', (await step({ mfaToken: (await login()).d.mfaToken, code: lCodes[0] })).s === 400, null)
  check('a user without 2FA logs in in one step as before', (await call('POST', '/api/auth/login', { email: A.user.email, password: PW })).d.accessToken !== undefined, null)

  // Wrong codes are rate-limited per user (rate limits are off in this API instance, so this
  // only checks the response stays a plain refusal; the limit itself is covered in rateLimits).
  check('wrong codes are refused with a plain message', (await mfa('/enable', { code: '123456' })).s === 400, null)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
