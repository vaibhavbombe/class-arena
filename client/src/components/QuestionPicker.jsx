import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { TYPE_LABELS } from './QuestionEditor.jsx'
import { colors, ghostButtonStyle, inputStyle, linkStyle, sectionTitleStyle } from '../styles.js'

const cardStyle = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.7rem 0.9rem', marginTop: '0.5rem' }

// Search the question bank and add questions to a test or live quiz.
// `types` limits which question types are offered (the server checks this too).
export default function QuestionPicker({ addedIds, onAdd, types }) {
  const [bank, setBank] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      api.get('/api/questions', { params: search ? { q: search } : {} })
        .then((response) => setBank(types ? response.data.filter((question) => types.includes(question.type)) : response.data))
        .catch(() => setBank([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [search, types])

  return (
    <section>
      <h3 style={sectionTitleStyle}>Add from question bank</h3>
      {types && <p style={{ color: colors.muted, fontSize: '0.8rem', marginTop: 0 }}>Showing {types.map((type) => TYPE_LABELS[type].toLowerCase()).join(' and ')} questions.</p>}
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your questions" aria-label="Search your questions" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
      {bank.length === 0 && (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
          No questions found. <Link to="/questions" style={linkStyle}>Add some in the question bank</Link>.
        </p>
      )}
      {bank.map((question) => (
        <article key={question._id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.75rem', color: colors.primary }}>{TYPE_LABELS[question.type]}</span>
            <p style={{ margin: '0.2rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{question.prompt}</p>
          </div>
          <button onClick={() => onAdd(question)} disabled={addedIds.has(question._id)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.5rem', flexShrink: 0 }}>
            {addedIds.has(question._id) ? 'Added' : '+ Add'}
          </button>
        </article>
      ))}
    </section>
  )
}
