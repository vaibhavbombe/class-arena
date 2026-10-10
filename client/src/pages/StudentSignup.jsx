import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { errorMessage, isLoggedIn, saveSession } from '../session.js'
import PasswordChecklist from '../components/PasswordChecklist.jsx'
import { passwordIsValid } from '../passwordRules.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, narrowPageStyle, titleStyle } from '../styles.js'

// Students self-register with a class join code (/join?code=ABC234 pre-fills it).
export default function StudentSignup() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ joinCode: searchParams.get('code') || '', name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alreadyLoggedIn] = useState(isLoggedIn)
  const navigate = useNavigate()

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!passwordIsValid(form.password)) {
      setError('Choose a password that meets all the requirements.')
      return
    }
    setSubmitting(true)

    try {
      const response = await api.post('/api/auth/student-signup', form)
      saveSession(response.data)
      navigate('/dashboard')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Signup failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={narrowPageStyle}>
      <h1 style={titleStyle}>Join a class</h1>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>Ask your teacher for the 6-character class code.</p>
      {alreadyLoggedIn && (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
          Someone is already logged in on this browser. Signing up will log them out in every tab.
          Already a student? <Link to="/dashboard" style={linkStyle}>Join from your dashboard</Link> instead.
        </p>
      )}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="joinCode" value={form.joinCode} placeholder="Class code (e.g. K7P2QX)" onChange={handleChange} required autoComplete="off" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em' }} />
        <input name="name" value={form.name} placeholder="Your name" onChange={handleChange} required style={inputStyle} />
        <input name="email" type="email" value={form.email} placeholder="Email" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Password" onChange={handleChange} minLength={8} required style={inputStyle} />
        <PasswordChecklist password={form.password} />
        <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Joining…' : 'Create account & join'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        <Link to="/login" style={linkStyle}>Already have an account? Log in</Link>
      </p>
    </main>
  )
}
