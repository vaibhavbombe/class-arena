// Real-time foundation: Socket.io accepts only valid access tokens; health reports Redis.
const { io } = require('socket.io-client')
const jwt = require('jsonwebtoken')
const { BASE, run, PW, call, check, invite, finish } = require('./helpers')

// Resolves with the socket once connected, or with the connection error message.
function connect(token) {
  return new Promise((resolve) => {
    const socket = io(BASE, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false, timeout: 5000 })
    socket.on('connect', () => resolve({ socket }))
    socket.on('connect_error', (err) => {
      socket.close()
      resolve({ error: err.message })
    })
  })
}

const whoami = (socket) => new Promise((resolve) => socket.emit('whoami', resolve))

;(async () => {
  const health = await call('GET', '/api/health')
  check('health reports Redis status', health.s === 200 && ['ok', 'not configured'].includes(health.d.redis), health.d)

  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Live', name: 'Admin', email: `rt-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'rt-t-')

  const none = await connect(undefined)
  check('socket without a token is refused', none.error === 'unauthorized', none)
  const garbage = await connect('not-a-jwt')
  check('socket with a garbage token is refused', garbage.error === 'unauthorized', garbage)
  const forged = await connect(jwt.sign({ userId: T.user.id, institutionId: T.user.institutionId, role: 'admin' }, 'wrong-secret'))
  check('socket with a token signed by someone else is refused', forged.error === 'unauthorized', forged)

  const ok = await connect(T.accessToken)
  const me = ok.socket && await whoami(ok.socket)
  check('valid token connects; identity comes from the token', me?.userId === T.user.id && me.role === 'teacher' && me.name === 'rt-t-', me)
  ok.socket?.close()

  // A removed user's still-unexpired token must stop working for sockets too.
  await call('DELETE', `/api/members/${T.user.id}`, null, A.accessToken)
  const removed = await connect(T.accessToken)
  check("a removed user's token can't open a socket", removed.error === 'unauthorized', removed)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
