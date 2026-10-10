import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cellStyle, colors, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle } from '../styles.js'

export function formatSeconds(total) {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes ? `${minutes} min${seconds ? ` ${seconds} s` : ''}` : `${seconds} s`
}

// Staff only: the class's live quizzes.
export default function LiveQuizzesPanel({ classId }) {
  const [quizzes, setQuizzes] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/live-quizzes', { params: { classId } })
      .then((response) => setQuizzes(response.data))
      .catch(() => setQuizzes([]))
  }, [classId])

  async function createQuiz() {
    setError('')
    try {
      const response = await api.post('/api/live-quizzes', { classId })
      navigate(`/live-quizzes/${response.data.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not create a live quiz.'))
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={sectionTitleStyle}>Live quizzes</h3>
        <button onClick={createQuiz} style={buttonStyle}>+ New live quiz</button>
      </div>
      {error && <p role="alert" style={messageStyle(false)}>{error}</p>}
      {quizzes.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No live quizzes yet. Build one from your multiple choice and multi-select questions.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Quiz</th>
                <th style={cellStyle}>Questions</th>
                <th style={cellStyle}>Length</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td style={cellStyle}><Link to={`/live-quizzes/${quiz.id}`} style={linkStyle}>{quiz.title}</Link></td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{quiz.questionCount}</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{formatSeconds(quiz.totalSeconds)} of questions</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
