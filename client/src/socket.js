import { io } from 'socket.io-client'
import api, { API_URL } from './api.js'

// Opens a Socket.io connection that logs in with the current access token.
// If the token has expired, the server refuses the connection; asking the API for /me
// makes the axios interceptor refresh the token, and then we connect again.
export function connectSocket() {
  const socket = io(API_URL, {
    auth: (send) => send({ token: localStorage.getItem('accessToken') }),
    transports: ['websocket', 'polling'],
  })

  let authRetries = 0
  socket.on('connect', () => { authRetries = 0 })
  socket.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || authRetries >= 2) return
    authRetries += 1
    try {
      await api.get('/api/me') // refreshes the token (or sends the user to /login)
      socket.connect()
    } catch {
      // The interceptor already redirected to the login page.
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
