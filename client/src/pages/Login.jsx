import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api.js'
import { errorMessage, saveSession } from '../session.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, messageStyle, narrowPageStyle, titleStyle } from '../styles.js'

export default function Login() {
  const [searchParams] = useSearchParams()
  const justReset = searchParams.get('reset') === '1'
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // With two-factor login on, the password step returns a short-lived token for the code step.
  const [mfaToken, setMfaToken] = useState(null)
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = mfaToken
        ? await authApi.post('/api/auth/login/mfa', { mfaToken, code: code.trim() })
        : await authApi.post('/api/auth/login', form)
      if (response.data.mfaRequired) {
        setMfaToken(response.data.mfaToken)
        return
      }
      saveSession(response.data)
      navigate('/dashboard')
    } catch (requestError) {
      // The code step expired (5 minutes): start again from the password.
      if (mfaToken && requestError.response?.status === 401) {
        setMfaToken(null)
        setCode('')
      }
      setError(errorMessage(requestError, 'Login failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={titleStyle}>ClassArena</h1>
      <p style={{ color: colors.muted, fontWeight: 600, margin: '0 0 1.25rem' }}>Tests, live quiz battles and more for your classes.</p>
      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{mfaToken ? 'Enter your code' : 'Log in'}</h2>
      {justReset && !mfaToken && <p style={messageStyle(true)}>Password updated. Log in with your new password.</p>}
      {mfaToken ? (
        <form onSubmit={handleSubmit} style={formStyle}>
          <label htmlFor="login-code" style={{ fontSize: '0.9rem', color: colors.muted }}>
            Open your authenticator app and enter the 6-digit code for ClassArena. Lost your phone? Use a recovery code.
          </label>
          <input id="login-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" maxLength={11} autoFocus required style={{ ...inputStyle, letterSpacing: '0.2em' }} />
          <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Checking…' : 'Verify'}</button>
          <button type="button" onClick={() => { setMfaToken(null); setCode(''); setError('') }} style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>Back</button>
          {error && <p role="alert" style={errorStyle}>{error}</p>}
        </form>
      ) : (
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="email" type="email" value={form.email} placeholder="Email" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Password" onChange={handleChange} required style={inputStyle} />
        <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Logging in…' : 'Log in'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
      )}
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
