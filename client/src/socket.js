import { io } from 'socket.io-client'
import { API_URL, refreshAccessToken } from './api.js'
import { getAccessToken } from './auth.js'

// Opens a Socket.io connection that logs in with the current access token (kept in memory).
// If the token has expired, the server refuses the connection; we get a new access token
// from the refresh cookie and connect again.
export function connectSocket() {
  const socket = io(API_URL, {
    auth: (send) => send({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
  })

  let authRetries = 0
  socket.on('connect', () => { authRetries = 0 })
  socket.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || authRetries >= 2) return
    authRetries += 1
    try {
      await refreshAccessToken()
      socket.connect()
    } catch {
      window.location.assign('/login')
    }
  })
  return socket
}

// emit with an acknowledgement, as a promise that always resolves.
export function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.timeout(10000).emit(event, payload, (err, response) => {
      resolve(err ? { error: 'No response from the server. Check your connection.' } : response)
    })
  })
}
