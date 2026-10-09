import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cellStyle, colors, linkStyle, messageStyle, sectionTitleStyle } from '../styles.js'
import { StatusBadge, windowText } from '../testFormat.jsx'

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
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td style={cellStyle}>
                    {isStaff ? <Link to={`/tests/${test.id}`} style={linkStyle}>{test.title}</Link> : test.title}
                  </td>
                  <td style={cellStyle}><StatusBadge status={test.status} /></td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{test.questionCount} · {test.totalPoints} pts</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{test.durationMinutes} min</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{windowText(test)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
