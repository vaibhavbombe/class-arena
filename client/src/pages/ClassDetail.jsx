import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import LiveQuizzesPanel from '../components/LiveQuizzesPanel.jsx'
import TestsPanel from '../components/TestsPanel.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { cellStyle, codeStyle, colors, ghostButtonStyle, inlineFormStyle, inputStyle, linkStyle, messageStyle, sectionTitleStyle, widePageStyle } from '../styles.js'

export default function ClassDetail() {
  const { id } = useParams()
  const me = useMe()
  const [cls, setCls] = useState(null)
  const [error, setError] = useState('')
  const [codeMsg, setCodeMsg] = useState(null)
  const [manageMsg, setManageMsg] = useState(null)
  const [staff, setStaff] = useState([])
  const navigate = useNavigate()

  function loadClass() {
    api.get(`/api/classes/${id}`)
      .then((response) => setCls(response.data))
      .catch((requestError) => setError(errorMessage(requestError, 'Could not load this class.')))
  }

  useEffect(loadClass, [id])

  // Admins can hand the class to another teacher; they need the list of staff for that.
  useEffect(() => {
    if (me?.user.role !== 'admin') return
    api.get('/api/members')
      .then((response) => setStaff(response.data.filter((member) => member.role !== 'student')))
      .catch(() => setStaff([]))
  }, [me])

  async function removeStudent(student) {
    if (!window.confirm(`Remove ${student.name} from this class? Their account stays; they can rejoin with the join code.`)) return
    try {
      await api.delete(`/api/classes/${id}/students/${student.id}`)
      setManageMsg({ ok: true, text: `${student.name} was removed from the class.` })
      loadClass()
    } catch (requestError) {
      setManageMsg({ ok: false, text: errorMessage(requestError, 'Could not remove the student.') })
    }
  }

  async function changeTeacher(event) {
    const teacherId = event.target.value
    if (!teacherId || teacherId === cls.teacher?.id) return
    try {
      const response = await api.patch(`/api/classes/${id}/teacher`, { teacherId })
      setCls((current) => ({ ...current, teacher: response.data.teacher }))
      setManageMsg({ ok: true, text: `${response.data.teacher.name} now teaches this class.` })
    } catch (requestError) {
      setManageMsg({ ok: false, text: errorMessage(requestError, 'Could not change the teacher.') })
    }
  }

  async function deleteClass() {
    if (!window.confirm(`Delete "${cls.name}"? Its tests and live quizzes will be deleted and all ${cls.studentCount} students removed from it. This can't be undone.`)) return
    try {
      await api.delete(`/api/classes/${id}`)
      navigate('/dashboard')
    } catch (requestError) {
      setManageMsg({ ok: false, text: errorMessage(requestError, 'Could not delete the class.') })
    }
  }

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

          <TestsPanel classId={id} isStaff={isStaff} />
          {isStaff && <LiveQuizzesPanel classId={id} />}

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
                        <th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cls.students.map((student) => (
                        <tr key={student.id}>
                          <td style={cellStyle}>{student.name}</td>
                          <td style={{ ...cellStyle, color: colors.muted }}>{student.email}</td>
                          <td style={{ ...cellStyle, color: colors.muted }}>{new Date(student.joinedAt).toLocaleDateString()}</td>
                          <td style={{ ...cellStyle, textAlign: 'right' }}>
                            <button onClick={() => removeStudent(student)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={sectionTitleStyle}>Manage class</h3>
              <div style={inlineFormStyle}>
                {me.user.role === 'admin' && (
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                    Teacher
                    <select value={cls.teacher?.id || ''} onChange={changeTeacher} style={inputStyle}>
                      {!cls.teacher && <option value="">(no teacher)</option>}
                      {staff.map((member) => (
                        <option key={member._id} value={member._id}>{member.name} ({member.role})</option>
                      ))}
                    </select>
                  </label>
                )}
                <button onClick={deleteClass} style={{ ...ghostButtonStyle, color: colors.accent, borderColor: colors.accent }}>Delete class</button>
              </div>
              {manageMsg && <p role="status" style={messageStyle(manageMsg.ok)}>{manageMsg.text}</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
