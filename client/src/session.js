import { authApi } from './api.js'
import { SESSION_MARKER, clearAuth, setAccessToken } from './auth.js'

export { isLoggedIn, tokenUserId } from './auth.js'

// After login/signup: the server has set the refresh cookie; keep the access token in memory.
export function saveSession({ accessToken }) {
  setAccessToken(accessToken)
}

export async function logout() {
  await authApi.post('/api/auth/logout').catch(() => {})
  clearAuth()
}

// Every tab of the site shares the refresh cookie. If another tab logs in as someone else or
// logs out, reload this tab so it never shows one user's screen with another user's session.
export function watchOtherTabs() {
  function handleStorage(event) {
    if (event.key !== SESSION_MARKER) return
    if (!event.newValue) window.location.assign('/login')
    else if (event.newValue !== event.oldValue) window.location.reload()
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export function errorMessage(error, fallback) {
  return error.response?.data?.error || fallback
}
