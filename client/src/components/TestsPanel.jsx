import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cellStyle, colors, linkStyle, messageStyle, sectionTitleStyle } from '../styles.js'
import { StatusBadge, windowText } from '../testFormat.jsx'

function StaffProgress({ test }) {
  if (test.status === 'draft') return <span style={{ color: colors.muted }}>—</span>
  const { started, submitted } = test.attempts
  return (
    <Link to={`/tests/${test.id}/results`} style={linkStyle}>
      {submitted}{started > submitted ? ` (+${started - submitted} in progress)` : ''} · results
    </Link>
  )
}

function MyProgress({ test }) {
  const attempt = test.myAttempt
  if (attempt?.status === 'submitted' && attempt.score !== undefined) {
    return <Link to={`/tests/${test.id}`} style={{ ...linkStyle, color: colors.teal }}>{attempt.score}/{attempt.maxScore} · review</Link>
  }
  if (attempt?.status === 'submitted') return <span style={{ color: colors.teal }}>Submitted</span>
  if (attempt) return <Link to={`/tests/${test.id}`} style={{ ...linkStyle, fontWeight: 'bold' }}>Continue</Link>
  if (test.status === 'open') return <Link to={`/tests/${test.id}`} style={{ ...linkStyle, fontWeight: 'bold' }}>Start</Link>
  if (test.status === 'closed') return <span style={{ color: colors.accent }}>Missed</span>
  return <span style={{ color: colors.muted }}>Not open yet</span>
}

// Tests in a class. Staff see drafts too and can create tests; students see published ones.
export default function TestsPanel({ classId, isStaff }) {
  const [tests, setTests] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/tests', { params: { classId } })
      .then((response) => setTests(response.data))
      .catch(() => setTests([]))
  }, [classId])

  async function createTest() {
    setError('')
    try {
      const response = await api.post('/api/tests', { classId })
      navigate(`/tests/${response.data.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not create a test.'))
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={sectionTitleStyle}>Tests</h3>
        {isStaff && <button onClick={createTest} style={buttonStyle}>+ New test</button>}
      </div>
      {error && <p role="alert" style={messageStyle(false)}>{error}</p>}

      {tests.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
          {isStaff ? 'No tests yet. Create one, add questions from your bank, then publish it.' : 'No tests have been published in this class yet.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Test</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Questions</th>
                <th style={cellStyle}>Duration</th>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>{isStaff ? 'Submitted' : 'You'}</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td style={cellStyle}><Link to={`/tests/${test.id}`} style={linkStyle}>{test.title}</Link></td>
                  <td style={cellStyle}><StatusBadge status={test.status} /></td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{test.questionCount} · {test.totalPoints} pts</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{test.durationMinutes} min</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{windowText(test)}</td>
                  <td style={cellStyle}>{isStaff ? <StaffProgress test={test} /> : <MyProgress test={test} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
