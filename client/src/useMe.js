import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api.js'

// Loads { user, institution } for the logged-in user, or sends them to /login.
// The role here only decides what to *show*; the server enforces every permission.
export default function useMe() {
  const [me, setMe] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/me')
      .then((response) => setMe(response.data))
      .catch(() => navigate('/login', { replace: true }))
  }, [navigate])

  return me
}
