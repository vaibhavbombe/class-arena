import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage, saveSession } from '../session.js'
import PasswordChecklist from '../components/PasswordChecklist.jsx'
import { passwordIsValid } from '../passwordRules.js'
import { buttonStyle, colors, errorStyle, formStyle, inputStyle, linkStyle, narrowPageStyle } from '../styles.js'

// Creates a new institute; the person signing up becomes its admin.
export default function Signup() {
  const [form, setForm] = useState({ institutionName: '', name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
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
      const response = await api.post('/api/auth/signup', form)
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
      <h1 style={{ color: colors.accent }}>Create an institute</h1>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>You'll be its admin and can invite teachers.</p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input name="institutionName" value={form.institutionName} placeholder="Institute name" onChange={handleChange} required style={inputStyle} />
        <input name="name" value={form.name} placeholder="Your name" onChange={handleChange} required style={inputStyle} />
        <input name="email" type="email" value={form.email} placeholder="Email" onChange={handleChange} required style={inputStyle} />
        <input name="password" type="password" value={form.password} placeholder="Password" onChange={handleChange} minLength={8} required style={inputStyle} />
        <PasswordChecklist password={form.password} />
        <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Creating…' : 'Create institute'}</button>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
      </form>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        <Link to="/join" style={linkStyle}>Student? Join with a class code</Link>
      </p>
      <p style={{ fontSize: '0.85rem' }}>
        <Link to="/login" style={linkStyle}>Already have an account? Log in</Link>
      </p>
    </main>
  )
}
