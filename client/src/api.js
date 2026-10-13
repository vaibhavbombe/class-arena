import axios from 'axios'
import { clearAuth, getAccessToken, isLoggedIn, setAccessToken } from './auth.js'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002'
// Requests that set or use the refresh-token cookie (login, signups, refresh, logout, invite
// accept). In production they go to this site itself ('' = same origin), which a Vercel
// rewrite forwards to the API, so the cookie is first-party. In development, localhost:5178
// and localhost:5002 are the same site, so they can go straight to the API.
export const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? (import.meta.env.PROD ? '' : API_URL)

const api = axios.create({ baseURL: API_URL })
export const authApi = axios.create({ baseURL: AUTH_URL, withCredentials: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function requestNewAccessToken() {
  try {
    const response = await authApi.post('/api/auth/refresh')
    return response.data.accessToken
  } catch (error) {
    if (error.response?.status !== 401) throw error
    // Another tab may have just rotated the shared cookie; the browser has the new one now.
    await sleep(500)
    const response = await authApi.post('/api/auth/refresh')
    return response.data.accessToken
  }
}

// Concurrent callers share one refresh (each refresh token works only once).
let refreshing = null
export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = requestNewAccessToken()
      .then((token) => { setAccessToken(token); return token })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

api.interceptors.request.use(async (config) => {
  // After a reload the access token is gone from memory: get one before the first request.
  if (!getAccessToken() && isLoggedIn()) await refreshAccessToken().catch(() => {})
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }
    originalRequest._retry = true
    try {
      const token = await refreshAccessToken()
      originalRequest.headers.Authorization = `Bearer ${token}`
      return api(originalRequest)
    } catch (refreshError) {
      clearAuth()
      window.location.assign('/login')
      return Promise.reject(refreshError)
    }
  },
)

export default api
