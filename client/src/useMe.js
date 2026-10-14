import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from './api.js'

// Loads { user, institution } for the logged-in user, or sends them to /login.
// The role here only decides what to *show*; the server enforces every permission.
export default function useMe() {
  const [me, setMe] = useState(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    api.get('/api/me')
      .then((response) => {
        // Required 2FA not set up yet: only the Security page works (the server enforces it).
        if (response.data.mfaSetupRequired && pathname !== '/security') navigate('/security', { replace: true })
        else setMe(response.data)
      })
      .catch(() => navigate('/login', { replace: true }))
  }, [navigate, pathname])

  return me
}
