// Login state in the browser.
//  - The access token (15 min) is kept in memory only, never in storage, so it isn't left
//    lying around for other scripts; after a reload it's fetched again with the refresh cookie.
//  - The refresh token (30 days) is an httpOnly cookie that page scripts can't read at all.
//  - localStorage keeps only a marker with the logged-in user's id (not a secret), so the app
//    knows to try a refresh after a reload and other tabs notice logins and logouts.
const MARKER = 'sessionUser'

let accessToken = null

export const getAccessToken = () => accessToken

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

export function setAccessToken(token) {
  accessToken = token
  try {
    if (token) localStorage.setItem(MARKER, tokenUserId(token) || 'unknown')
  } catch { /* storage blocked: only cross-tab updates are lost */ }
}

export function clearAuth() {
  accessToken = null
  try {
    localStorage.removeItem(MARKER)
    // Left over from before the refresh token moved to a cookie.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  } catch { /* nothing to clear */ }
}

export function isLoggedIn() {
  try {
    return Boolean(localStorage.getItem(MARKER) || localStorage.getItem('refreshToken'))
  } catch {
    return Boolean(accessToken)
  }
}

export const SESSION_MARKER = MARKER
