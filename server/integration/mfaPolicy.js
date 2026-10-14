// Institute policy "require two-factor login for staff": only admins with 2FA can switch it on;
// staff without 2FA are then refused everywhere (HTTP and Socket.io) except the 2FA setup routes
// and /api/me; students and other institutes are unaffected; staff can't turn 2FA off under it.
const { io } = require('socket.io-client')
const totp = require('../lib/totp')
const { BASE, run, PW, call, check, invite, finish } = require('./helpers')

function connect(token) {
  return new Promise((resolve) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 })
    socket.on('connect', () => { socket.close(); resolve('connected') })
    socket.on('connect_error', (err) => { socket.close(); resolve(err.message) })
  })
}

// Turns 2FA on for a user; returns the secret (to make later codes).
async function enableMfa(token) {
  const { secret } = (await call('POST', '/api/auth/mfa/setup', { password: PW }, token)).d
  await call('POST', '/api/auth/mfa/enable', { code: totp.generate(secret) }, token)
  return secret
}

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Policy', name: 'Admin', email: `pol-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'pol-t-')
  const cls = (await call('POST', '/api/classes', { name: 'Policy class' }, A.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'Stu', email: `pol-s${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Other', name: 'Other admin', email: `pol-b${run}@example.com`, password: PW })).d
  const setPolicy = (value, token = A.accessToken) => call('PUT', '/api/institute/security', { requireStaffMfa: value }, token)

  check('an admin without 2FA cannot switch the policy on (no locking yourself out)', (await setPolicy(true)).s === 409, null)
  check('a teacher cannot change the policy', (await setPolicy(true, T.accessToken)).s === 403, null)
  check('the value must be true or false', (await setPolicy('yes')).s === 400, null)

  const adminSecret = await enableMfa(A.accessToken)
  const on = await setPolicy(true)
  check('with 2FA on, the admin switches the policy on and sees how many staff still lack 2FA', on.s === 200 && on.d.requireStaffMfa === true && on.d.staffWithoutMfa === 1, on.d)

  const blocked = await call('GET', '/api/classes', null, T.accessToken)
  check('a teacher without 2FA is refused with MFA_SETUP_REQUIRED', blocked.s === 403 && blocked.d.code === 'MFA_SETUP_REQUIRED', blocked.d)
  check('...on writes too', (await call('POST', '/api/classes', { name: 'Nope' }, T.accessToken)).s === 403, null)
  const me = await call('GET', '/api/me', null, T.accessToken)
  check('...but /api/me works and says setup is required', me.s === 200 && me.d.mfaSetupRequired === true && me.d.institution.requireStaffMfa === true, me.d)
  check('...and so does the 2FA status page', (await call('GET', '/api/auth/mfa', null, T.accessToken)).s === 200, null)
  check('...and live connections are refused too', (await connect(T.accessToken)) === 'mfa_setup_required', null)
  const relogin = await call('POST', '/api/auth/login', { email: `pol-t-${run}@example.com`, password: PW })
  check('logging in still works, so the teacher can reach the setup', relogin.s === 200 && typeof relogin.d.accessToken === 'string', relogin.d)

  check('students are not affected', (await call('GET', '/api/classes', null, S.accessToken)).s === 200 && (await call('GET', '/api/me', null, S.accessToken)).d.mfaSetupRequired === false, null)
  check('the admin (with 2FA) is not affected', (await call('GET', '/api/classes', null, A.accessToken)).s === 200, null)
  check('another institute is not affected', (await call('GET', '/api/classes', null, B.accessToken)).s === 200 && (await call('GET', '/api/me', null, B.accessToken)).d.institution.requireStaffMfa === false, null)

  const teacherSecret = await enableMfa(T.accessToken)
  check('once the teacher sets up 2FA, everything works again (no new login needed)', (await call('GET', '/api/classes', null, T.accessToken)).s === 200 && (await connect(T.accessToken)) === 'connected', null)
  const off = await call('POST', '/api/auth/mfa/disable', { password: PW, code: totp.generate(teacherSecret, Date.now() + 30_000) }, T.accessToken)
  check('under the policy, staff cannot turn 2FA off', off.s === 409, off.d)
  check('...admins neither', (await call('POST', '/api/auth/mfa/disable', { password: PW, code: totp.generate(adminSecret, Date.now() + 30_000) }, A.accessToken)).s === 409, null)

  const policyOff = await setPolicy(false)
  check('the admin can switch the policy off', policyOff.s === 200 && policyOff.d.requireStaffMfa === false, policyOff.d)
  check('then staff may turn 2FA off again', (await call('POST', '/api/auth/mfa/disable', { password: PW, code: totp.generate(teacherSecret, Date.now() + 30_000) }, T.accessToken)).s === 200, null)

  // Admin reset for a member who lost their phone and recovery codes.
  const R = await invite(A.accessToken, 'pol-r-')
  await enableMfa(R.accessToken)
  const reset = (id, body, token = A.accessToken) => call('POST', `/api/members/${id}/mfa-reset`, body, token)
  check('a teacher cannot reset someone\'s 2FA', (await reset(R.user.id, { password: PW }, T.accessToken)).s === 403, null)
  check('the admin must confirm with their password', (await reset(R.user.id, { password: 'Wrong-pass1!' })).s === 400 && (await reset(R.user.id, {})).s === 400, null)
  check('not for your own account', (await reset(A.user.id, { password: PW })).s === 400, null)
  check('not for members of another institute', (await reset(R.user.id, { password: PW }, B.accessToken)).s === 404, null)
  check('not for a member without 2FA', (await reset(T.user.id, { password: PW })).s === 409, null)
  const done = await reset(R.user.id, { password: PW })
  check('the admin resets it', done.s === 200 && (await call('GET', '/api/auth/mfa', null, R.accessToken)).d.enabled === false, done.d)
  check('...and the member is signed out everywhere (old refresh cookie refused)', (await call('POST', '/api/auth/refresh', null, null, { cookie: R.refreshToken })).s === 401, null)
  const back = await call('POST', '/api/auth/login', { email: `pol-r-${run}@example.com`, password: PW })
  check('...and can log in with the password and set 2FA up again', back.s === 200 && typeof back.d.accessToken === 'string' && !back.d.mfaRequired, back.d)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
