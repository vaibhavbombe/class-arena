import api from './api.js'

export function saveSession({ accessToken, refreshToken }) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

export async function logout() {
  const refreshToken = localStorage.getItem('refreshToken')
  await api.post('/api/auth/logout', { refreshToken }).catch(() => {})
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

// Reads the user id out of a JWT without verifying it. Only used to decide what the
// UI shows; the server verifies the signature on every request.
export function tokenUserId(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).userId
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return Boolean(localStorage.getItem('accessToken'))
}

// localStorage is shared by every tab of the site. If another tab logs in as someone
// else or logs out, reload this tab so it never shows one user's screen with another
// user's token. A token refresh for the same user changes nothing.
export function watchOtherTabs() {
  function handleStorage(event) {
    if (event.key !== 'accessToken') return
    if (!event.newValue) {
      window.location.assign('/login')
    } else if (tokenUserId(event.newValue) !== tokenUserId(event.oldValue)) {
      window.location.reload()
    }
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export function errorMessage(error, fallback) {
  return error.response?.data?.error || fallback
}
