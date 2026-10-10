import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cardStyle, cellStyle, colors, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle } from '../styles.js'
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

const actionLink = { ...buttonStyle, textDecoration: 'none', display: 'inline-block', padding: '0.55rem 1.2rem' }

// The student's next step for a test, as a big button when there's something to do.
function MyProgress({ test }) {
  const attempt = test.myAttempt
  if (attempt?.status === 'submitted' && attempt.score !== undefined) {
    return <Link to={`/tests/${test.id}`} style={{ ...actionLink, background: colors.success, boxShadow: '0 3px 0 #145206' }}>{attempt.score}/{attempt.maxScore} · Review</Link>
  }
  if (attempt?.status === 'submitted') return <span style={{ color: colors.success, fontWeight: 800 }}>✓ Submitted</span>
  if (attempt) return <Link to={`/tests/${test.id}`} style={actionLink}>Continue ▸</Link>
  if (test.status === 'open') return <Link to={`/tests/${test.id}`} style={actionLink}>Start ▸</Link>
  if (test.status === 'closed') return <span style={{ color: colors.danger, fontWeight: 800 }}>Missed</span>
  return <span style={{ color: colors.muted, fontWeight: 700 }}>Opens later</span>
}

// Students get one card per test (works on a phone; no sideways scrolling to find "Start").
function StudentTestCards({ tests }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {tests.map((test) => (
        <article key={test.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1.05rem' }}>{test.title}</strong>
              <StatusBadge status={test.status} />
            </div>
            <div style={{ color: colors.muted, fontSize: '0.85rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {test.questionCount} questions · {test.totalPoints} pts · {test.durationMinutes} min · {windowText(test)}
            </div>
          </div>
          <MyProgress test={test} />
        </article>
      ))}
    </div>
  )
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
      ) : !isStaff ? (
        <StudentTestCards tests={tests} />
      ) : (
        <div style={tableWrapStyle}>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Test</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Questions</th>
                <th style={cellStyle}>Duration</th>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>Submitted</th>
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
                  <td style={cellStyle}><StaffProgress test={test} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
