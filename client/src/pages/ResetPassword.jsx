import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, narrowPageStyle } from '../styles.js'

// Opened from the link in the reset email (/reset-password?token=...).
export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)

    try {
      await api.post('/api/auth/reset-password', { token, password: form.password })
      navigate('/login?reset=1')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not reset the password. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={{ color: colors.accent }}>Choose a new password</h1>
      {!token && <p role="alert" style={errorStyle}>This reset link is missing its token.</p>}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="password" type="password" value={form.password} placeholder="New password (8+ characters)" onChange={handleChange} minLength={8} required style={inputStyle} />
        <input name="confirm" type="password" value={form.confirm} placeholder="Type it again" onChange={handleChange} minLength={8} required style={inputStyle} />
        <button type="submit" disabled={!token || submitting} style={buttonStyle}>{submitting ? 'Saving…' : 'Set new password'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        <Link to="/forgot-password" style={linkStyle}>Need a new link?</Link>
      </p>
    </main>
  )
}
