import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, messageStyle, narrowPageStyle, titleStyle } from '../styles.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await api.post('/api/auth/forgot-password', { email })
      // The server says the same thing whether or not the account exists.
      setMessage(response.data.message)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Something went wrong. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={titleStyle}>Forgot password</h1>
      {message ? (
        <>
          <p style={messageStyle(true)}>{message}</p>
          <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
            The link expires in 30 minutes. Check your spam folder if it doesn't arrive.
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit} style={formStyle}>
          <p style={{ color: colors.muted, fontSize: '0.85rem', margin: 0 }}>
            Enter your account email and we'll send you a link to choose a new password.
          </p>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required style={inputStyle} />
          <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Sending…' : 'Send reset link'}</button>
          {error && <p role="alert" style={errorStyle}>{error}</p>}
        </form>
      )}
      <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        <Link to="/login" style={linkStyle}>Back to log in</Link>
      </p>
    </main>
  )
}
