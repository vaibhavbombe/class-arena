import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { errorMessage, saveSession } from '../session.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, narrowPageStyle } from '../styles.js'

// Teachers (and co-admins) land here from the invite email.
export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [form, setForm] = useState({ name: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await api.post('/api/invites/accept', { token, ...form })
      saveSession(response.data)
      navigate('/dashboard')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not accept invite. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={{ color: colors.accent }}>Join your institute</h1>
      {!token && <p role="alert" style={errorStyle}>This invite link is missing its token.</p>}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="name" value={form.name} placeholder="Your name" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Choose a password (8+ characters)" onChange={handleChange} minLength={8} required style={inputStyle} />
        <button type="submit" disabled={!token || submitting} style={buttonStyle}>{submitting ? 'Joining…' : 'Join'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
    </main>
  )
}
