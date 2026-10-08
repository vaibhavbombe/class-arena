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

export function errorMessage(error, fallback) {
  return error.response?.data?.error || fallback
}
