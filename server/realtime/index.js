const { Server } = require('socket.io')
const { authenticateToken } = require('../middleware/auth')
const { initLiveGames, registerLiveGame } = require('./liveGame')

// Socket.io for live features. Every connection must present the same access token the
// HTTP API uses; the identity comes from the verified token, never from the client.
function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL },
  })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || !token) return next(new Error('unauthorized'))
    try {
      const { identity, error } = await authenticateToken(token)
      if (error) return next(new Error('unauthorized'))
      socket.data.user = identity
      next()
    } catch (err) {
      console.error('Socket auth failed:', err)
      next(new Error('server error'))
    }
  })

  io.on('connection', (socket) => {
    const { userId, institutionId } = socket.data.user
    // Personal and institute rooms, so the server can message one user or one tenant.
    socket.join(`user:${userId}`)
    socket.join(`institution:${institutionId}`)

    // Lets clients (and the integration tests) confirm who the server thinks they are.
    socket.on('whoami', (ack) => {
      if (typeof ack === 'function') ack({ userId, role: socket.data.user.role, name: socket.data.user.name })
    })

    registerLiveGame(socket)
  })

  initLiveGames(io)
  return io
}

module.exports = { attachRealtime }
