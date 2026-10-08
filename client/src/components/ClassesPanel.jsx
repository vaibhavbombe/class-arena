import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cellStyle, codeStyle, colors, inlineFormStyle, inputStyle, linkStyle, messageStyle, sectionTitleStyle } from '../styles.js'

// Staff create classes and see join codes; students join by code.
// The server already returns only the classes this user may see.
export default function ClassesPanel({ role }) {
  const isStaff = role !== 'student'
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState({ name: '', subject: '', joinCode: '' })
  const [message, setMessage] = useState(null)

  function loadClasses() {
    api.get('/api/classes').then((response) => setClasses(response.data)).catch(() => setClasses([]))
  }

  useEffect(loadClasses, [])

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)
    try {
      if (isStaff) {
        const response = await api.post('/api/classes', { name: form.name, subject: form.subject })
        setMessage({ ok: true, text: `Created "${response.data.name}". Join code: ${response.data.joinCode}` })
      } else {
        const response = await api.post('/api/classes/join', { joinCode: form.joinCode })
        setMessage({ ok: true, text: `Joined "${response.data.name}"` })
      }
      setForm({ name: '', subject: '', joinCode: '' })
      loadClasses()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Something went wrong.') })
    }
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>{role === 'admin' ? 'All classes' : 'My classes'}</h2>

      <form onSubmit={handleSubmit} style={inlineFormStyle}>
        {isStaff ? (
          <>
            <input name="name" value={form.name} onChange={handleChange} placeholder="Class name" required style={inputStyle} />
            <input name="subject" value={form.subject} onChange={handleChange} placeholder="Subject (optional)" style={inputStyle} />
            <button type="submit" style={buttonStyle}>Create class</button>
          </>
        ) : (
          <>
            <input name="joinCode" value={form.joinCode} onChange={handleChange} placeholder="Class code" required autoComplete="off" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em' }} />
            <button type="submit" style={buttonStyle}>Join class</button>
          </>
        )}
      </form>
      {message && <p style={messageStyle(message.ok)}>{message.text}</p>}

      {classes.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem', marginTop: '1rem' }}>
          {isStaff ? 'No classes yet. Create one above.' : 'You are not in any classes yet.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', marginTop: '1rem', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Class</th>
                <th style={cellStyle}>Subject</th>
                {role !== 'teacher' && <th style={cellStyle}>Teacher</th>}
                {isStaff && <th style={cellStyle}>Students</th>}
                {isStaff && <th style={cellStyle}>Join code</th>}
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => (
                <tr key={cls.id}>
                  <td style={cellStyle}><Link to={`/classes/${cls.id}`} style={linkStyle}>{cls.name}</Link></td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{cls.subject || '—'}</td>
                  {role !== 'teacher' && <td style={cellStyle}>{cls.teacher?.name}</td>}
                  {isStaff && <td style={cellStyle}>{cls.studentCount}</td>}
                  {isStaff && <td style={{ ...cellStyle, ...codeStyle }}>{cls.joinCode}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
