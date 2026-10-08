import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { cellStyle, codeStyle, colors, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, widePageStyle } from '../styles.js'

export default function ClassDetail() {
  const { id } = useParams()
  const me = useMe()
  const [cls, setCls] = useState(null)
  const [error, setError] = useState('')
  const [codeMsg, setCodeMsg] = useState(null)

  useEffect(() => {
    api.get(`/api/classes/${id}`)
      .then((response) => setCls(response.data))
      .catch((requestError) => setError(errorMessage(requestError, 'Could not load this class.')))
  }, [id])

  async function regenerateCode() {
    if (!window.confirm('Replace the join code? The old code will stop working. Students already in the class stay in it.')) return
    try {
      const response = await api.post(`/api/classes/${id}/join-code`)
      setCls((current) => ({ ...current, joinCode: response.data.joinCode }))
      setCodeMsg({ ok: true, text: 'New join code created.' })
    } catch (requestError) {
      setCodeMsg({ ok: false, text: errorMessage(requestError, 'Could not change the code.') })
    }
  }

  if (!me) return null
  const isStaff = me.user.role !== 'student'
  const joinLink = cls?.joinCode && `${window.location.origin}/join?code=${cls.joinCode}`

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to="/dashboard" style={linkStyle}>← Back to dashboard</Link></p>

      {error && <p role="alert" style={messageStyle(false)}>{error}</p>}
      {cls && (
        <>
          <h2 style={{ marginBottom: '0.25rem' }}>{cls.name}</h2>
          <p style={{ color: colors.muted, marginTop: 0 }}>
            {cls.subject && `${cls.subject} · `}Teacher: {cls.teacher?.name}
          </p>

          {isStaff && (
            <>
              <h3 style={sectionTitleStyle}>Join code</h3>
              <p>
                <span style={{ ...codeStyle, fontSize: '1.5rem' }}>{cls.joinCode}</span>{' '}
                <button onClick={regenerateCode} style={{ ...ghostButtonStyle, marginLeft: '1rem' }}>New code</button>
              </p>
              <p style={{ color: colors.muted, fontSize: '0.85rem', wordBreak: 'break-all' }}>Or share: {joinLink}</p>
              {codeMsg && <p style={messageStyle(codeMsg.ok)}>{codeMsg.text}</p>}

              <h3 style={sectionTitleStyle}>Students ({cls.studentCount})</h3>
              {cls.students.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No students yet. Share the join code.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={cellStyle}>Name</th>
                        <th style={cellStyle}>Email</th>
                        <th style={cellStyle}>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cls.students.map((student) => (
                        <tr key={student.id}>
                          <td style={cellStyle}>{student.name}</td>
                          <td style={{ ...cellStyle, color: colors.muted }}>{student.email}</td>
                          <td style={{ ...cellStyle, color: colors.muted }}>{new Date(student.joinedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!isStaff && (
            <p style={{ color: colors.muted, fontSize: '0.85rem', marginTop: '2rem' }}>
              Tests and live quizzes for this class will show up here.
            </p>
          )}
        </>
      )}
    </div>
  )
}
