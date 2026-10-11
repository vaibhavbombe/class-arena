// Rate limits, against an API with limits switched on and fresh counters (see run.js).
// Order matters: the IP-wide blocks (wrong join codes, signups) are triggered last.
const { io } = require('socket.io-client')
const LIMITS = require('../lib/limits')
const { BASE, run, PW, call, check, connectTestDb, finish } = require('./helpers')

const login = (email, password, headers) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ email, password }) })
  .then(async (r) => ({ s: r.status, retryAfter: r.headers.get('retry-after'), d: await r.json() }))
const repeat = async (n, fn) => { for (let i = 0; i < n; i++) await fn(i) }
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve))

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Limits', name: 'Admin', email: `rl-a${run}@example.com`, password: PW })).d
  const cls = (await call('POST', '/api/classes', { name: 'Limits class' }, A.accessToken)).d
  const student = async (name) => (await call('POST', '/api/auth/student-signup', { name, email: `rl-${name}${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const [ann, bob, cat] = [await student('ann'), await student('bob'), await student('cat')]
  const failLimit = LIMITS.login.failuresPerAccountAndIp.limit

  // Login: wrong passwords per account (from this IP).
  const annEmail = `rl-ann${run}@example.com`
  await repeat(failLimit, () => login(annEmail, 'Wrong-pass1!'))
  const blocked = await login(annEmail, PW)
  check(`after ${failLimit} wrong passwords the account is blocked, even with the right password`, blocked.s === 429 && Number(blocked.retryAfter) > 0 && /Too many failed logins/.test(blocked.d.error), blocked)
  const spoofed = await login(annEmail, PW, { 'X-Forwarded-For': '203.0.113.7' })
  check('a fake X-Forwarded-For header does not get around it', spoofed.s === 429, spoofed.s)
  check('other accounts from the same IP can still log in', (await login(`rl-bob${run}@example.com`, PW)).s === 200, null)

  const ghost = `rl-nobody${run}@example.com`
  await repeat(failLimit, () => login(ghost, 'Wrong-pass1!'))
  check('unknown emails are limited the same way (no hint that the account does not exist)', (await login(ghost, 'Wrong-pass1!')).s === 429, null)

  const catEmail = `rl-cat${run}@example.com`
  await repeat(failLimit - 2, () => login(catEmail, 'Wrong-pass1!'))
  check('a successful login resets the count', (await login(catEmail, PW)).s === 200, null)
  await repeat(failLimit - 1, () => login(catEmail, 'Wrong-pass1!'))
  check('...so later typos start from zero again', (await login(catEmail, 'Wrong-pass1!')).s === 401, null)

  // Joining another class with a code: wrong codes per student.
  const codeLimit = LIMITS.classJoin.wrongCodesPerUser.limit
  await repeat(codeLimit, () => call('POST', '/api/classes/join', { joinCode: 'ZZZZZZ' }, bob.accessToken))
  const joinBlocked = await call('POST', '/api/classes/join', { joinCode: cls.joinCode }, bob.accessToken)
  check(`after ${codeLimit} wrong class codes a student is blocked`, joinBlocked.s === 429, joinBlocked)
  check('other students can still join', (await call('POST', '/api/classes/join', { joinCode: cls.joinCode }, cat.accessToken)).s === 409, null) // 409 = already in it

  // Game PINs over Socket.io: wrong PINs per student.
  const socket = await connect(ann.accessToken)
  const pinLimit = LIMITS.gamePin.wrongPinsPerUser.limit
  await repeat(pinLimit, () => emit(socket, 'player:join', { pin: '123456' }))
  const pinBlocked = await emit(socket, 'player:join', { pin: '123456' })
  check(`after ${pinLimit} wrong game PINs a student is blocked`, /Too many wrong PINs/.test(pinBlocked.error || ''), pinBlocked)
  socket.close()

  // Student signup with wrong class codes: per IP (this blocks the IP's signups for a while).
  const signupLimit = LIMITS.studentSignup.wrongCodesPerIp.limit
  await repeat(signupLimit, (i) => call('POST', '/api/auth/student-signup', { name: 'Guess', email: `rl-g${i}${run}@example.com`, password: PW, joinCode: 'QQQQQQ' }))
  const codeBlocked = await call('POST', '/api/auth/student-signup', { name: 'Real', email: `rl-real${run}@example.com`, password: PW, joinCode: cls.joinCode })
  check(`after ${signupLimit} wrong codes at signup the IP is blocked`, codeBlocked.s === 429, codeBlocked)

  // Institute signups per IP (one was used at the start).
  const perIp = LIMITS.signup.perIp.limit
  await repeat(perIp - 1, (i) => call('POST', '/api/auth/signup', { institutionName: `L${i}`, name: 'Admin', email: `rl-x${i}${run}@example.com`, password: PW }))
  const signupBlocked = await call('POST', '/api/auth/signup', { institutionName: 'One too many', name: 'Admin', email: `rl-y${run}@example.com`, password: PW })
  check(`more than ${perIp} institute signups per hour from one IP are refused`, signupBlocked.s === 429, signupBlocked)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
