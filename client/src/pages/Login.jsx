import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { errorMessage, saveSession } from '../session.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, messageStyle, narrowPageStyle, titleStyle } from '../styles.js'

export default function Login() {
  const [searchParams] = useSearchParams()
  const justReset = searchParams.get('reset') === '1'
  const [form, setForm] = useState({ email: '', password: '' })
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
      const response = await api.post('/api/auth/login', form)
      saveSession(response.data)
      navigate('/dashboard')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Login failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={titleStyle}>ClassArena</h1>
      <p style={{ color: colors.muted, fontWeight: 600, margin: '0 0 1.25rem' }}>Tests, live quiz battles and more for your classes.</p>
      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Log in</h2>
      {justReset && <p style={messageStyle(true)}>Password updated. Log in with your new password.</p>}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="email" type="email" value={form.email} placeholder="Email" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Password" onChange={handleChange} required style={inputStyle} />
        <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Logging in…' : 'Log in'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
      <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
        <Link to="/forgot-password" style={linkStyle}>Forgot password?</Link>
      </p>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        <Link to="/join" style={linkStyle}>Student? Join with a class code</Link>
      </p>
      <p style={{ fontSize: '0.85rem' }}>
        <Link to="/signup" style={linkStyle}>Run an institute? Create one</Link>
      </p>
    </main>
  )
}
