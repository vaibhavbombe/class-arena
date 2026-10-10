import { useEffect, useState } from 'react'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import QuestionEditor, { TYPE_LABELS } from '../components/QuestionEditor.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, colors, ghostButtonStyle, inputStyle, messageStyle, sectionTitleStyle, widePageStyle } from '../styles.js'

const cardStyle = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.8rem 1rem', marginTop: '0.75rem' }
const badgeStyle = { fontSize: '0.75rem', border: `1px solid ${colors.border}`, borderRadius: '999px', padding: '0.1rem 0.5rem', color: colors.muted }

function AnswerSummary({ question }) {
  if (question.type === 'short') {
    return <p style={{ fontSize: '0.8rem', color: colors.success, margin: '0.4rem 0 0' }}>Accepts: {question.acceptedAnswers.join(' · ')}{question.caseSensitive ? ' (case sensitive)' : ''}</p>
  }
  return (
    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
      {question.options.map((option) => (
        <li key={option.id} style={{ color: option.correct ? colors.success : colors.muted }}>{option.correct ? '✓ ' : ''}{option.text}</li>
      ))}
    </ul>
  )
}

export default function QuestionBank() {
  const me = useMe()
  const [questions, setQuestions] = useState([])
  const [tags, setTags] = useState([])
  const [filters, setFilters] = useState({ type: '', tag: '', q: '' })
  const [editing, setEditing] = useState(null) // null = closed, 'new', or a question
  const [message, setMessage] = useState(null)

  function load() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
    api.get('/api/questions', { params }).then((response) => setQuestions(response.data)).catch(() => setQuestions([]))
    api.get('/api/questions/tags').then((response) => setTags(response.data)).catch(() => setTags([]))
  }

  // Wait a moment after typing in the search box before asking the server.
  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [filters])

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function handleSaved() {
    setMessage({ ok: true, text: editing === 'new' ? 'Question added.' : 'Question updated.' })
    setEditing(null)
    load()
  }

  async function handleDelete(question) {
    if (!window.confirm('Delete this question? Tests that already use it keep their own copy.')) return
    try {
      await api.delete(`/api/questions/${question._id}`)
      setMessage({ ok: true, text: 'Question deleted.' })
      load()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not delete the question.') })
    }
  }

  if (!me) return null
  if (me.user.role === 'student') {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        <p style={messageStyle(false)}>The question bank is for teachers and admins.</p>
      </div>
    )
  }

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 style={sectionTitleStyle}>Question bank {me.user.role === 'admin' ? '(whole institute)' : ''}</h2>
        {editing === null && <button onClick={() => { setMessage(null); setEditing('new') }} style={buttonStyle}>+ New question</button>}
      </div>

      {editing !== null && (
        <QuestionEditor
          key={editing === 'new' ? 'new' : editing._id}
          question={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}
      {message && <p role="status" style={messageStyle(message.ok)}>{message.text}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <input type="search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search questions" aria-label="Search questions" style={{ ...inputStyle, flex: '1 1 200px' }} />
        <select value={filters.type} onChange={(event) => setFilter('type', event.target.value)} aria-label="Filter by type" style={inputStyle}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={filters.tag} onChange={(event) => setFilter('tag', event.target.value)} aria-label="Filter by tag" style={inputStyle}>
          <option value="">All tags</option>
          {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </div>

      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>{questions.length} question{questions.length === 1 ? '' : 's'}</p>
      {questions.map((question) => (
        <article key={question._id} style={cardStyle}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...badgeStyle, color: colors.primary }}>{TYPE_LABELS[question.type]}</span>
            <span style={badgeStyle}>{question.difficulty}</span>
            {question.tags.map((tag) => <span key={tag} style={badgeStyle}>#{tag}</span>)}
            {me.user.role === 'admin' && question.ownerName && <span style={{ fontSize: '0.75rem', color: colors.muted }}>by {question.ownerName}</span>}
          </div>
          <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{question.prompt}</p>
          <AnswerSummary question={question} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button onClick={() => { setMessage(null); setEditing(question) }} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Edit</button>
            <button onClick={() => handleDelete(question)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  )
}
