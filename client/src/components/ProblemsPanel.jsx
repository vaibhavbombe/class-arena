import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import QuestionPicker from './QuestionPicker.jsx'
import { errorMessage } from '../session.js'
import { buttonStyle, cardStyle, colors, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle } from '../styles.js'

const CODE_ONLY = ['code']
const STATUS = {
  solved: { text: '✓ Solved', color: 'success' },
  attempted: { text: 'Attempted', color: 'muted' },
  new: { text: 'New', color: 'primary' },
}

// Coding practice problems in a class. Staff add them from the bank; students solve them.
export default function ProblemsPanel({ classId, isStaff }) {
  const [problems, setProblems] = useState([])
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState(null)

  function load() {
    api.get('/api/problems', { params: { classId } }).then((response) => setProblems(response.data)).catch(() => setProblems([]))
  }
  useEffect(load, [classId])

  async function addProblem(question) {
    setMessage(null)
    try {
      await api.post('/api/problems', { classId, questionId: question._id })
      setMessage({ ok: true, text: 'Added to the class.' })
      setAdding(false)
      load()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not add the problem.') })
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={sectionTitleStyle}>Coding practice</h3>
        {isStaff && <button onClick={() => setAdding((open) => !open)} style={adding ? ghostButtonStyle : buttonStyle}>{adding ? 'Close' : '+ Add coding problem'}</button>}
      </div>
      {message && <p role="status" style={messageStyle(message.ok)}>{message.text}</p>}
      {adding && <QuestionPicker addedIds={new Set()} onAdd={addProblem} types={CODE_ONLY} />}

      {problems.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
          {isStaff ? 'No coding problems yet. Write a coding question in the question bank, then add it here.' : 'No coding problems yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
          {problems.map((problem) => {
            const status = STATUS[problem.status]
            return (
              <article key={problem.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.8rem 1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <Link to={`/problems/${problem.id}`} style={{ ...linkStyle, fontSize: '1.02rem' }}>{problem.title}</Link>
                  <div style={{ color: colors.muted, fontSize: '0.8rem', fontWeight: 600 }}>
                    {problem.difficulty}
                    {isStaff ? ` · ${problem.solved} solved · ${problem.attempted} tried` : problem.attempts ? ` · ${problem.attempts} attempt${problem.attempts === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                {isStaff
                  ? <Link to={`/problems/${problem.id}`} style={{ ...ghostButtonStyle, textDecoration: 'none' }}>Open</Link>
                  : <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ color: colors[status.color], fontWeight: 800, fontSize: '0.85rem' }}>{status.text}</span>
                    <Link to={`/problems/${problem.id}`} style={{ ...buttonStyle, textDecoration: 'none', padding: '0.5rem 1rem' }}>{problem.status === 'solved' ? 'Review' : 'Solve ▸'}</Link>
                  </span>}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
