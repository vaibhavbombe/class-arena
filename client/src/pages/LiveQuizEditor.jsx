import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { formatSeconds } from '../components/LiveQuizzesPanel.jsx'
import { TYPE_LABELS } from '../components/QuestionEditor.jsx'
import QuestionPicker from '../components/QuestionPicker.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, colors, dangerButtonStyle, ghostButtonStyle, inputStyle, linkStyle, messageStyle, sectionTitleStyle, widePageStyle } from '../styles.js'

const LIVE_TYPES = ['mcq', 'multi']
const SECONDS_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120]
const DEFAULT_SECONDS = 20
const cardStyle = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.7rem 0.9rem', marginTop: '0.5rem' }
const smallButton = { ...ghostButtonStyle, padding: '0.2rem 0.5rem' }

export default function LiveQuizEditor() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState(null)
  const [title, setTitle] = useState('')
  const [items, setItems] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  function apply(data) {
    setQuiz(data)
    setTitle(data.title)
    setItems(data.items)
    setDirty(false)
  }

  useEffect(() => {
    api.get(`/api/live-quizzes/${id}`)
      .then((response) => apply(response.data))
      .catch((requestError) => setMessage({ ok: false, text: errorMessage(requestError, 'Could not load this live quiz.') }))
  }, [id])

  function change(updater) {
    setItems(updater)
    setDirty(true)
  }

  function moveItem(index, delta) {
    change((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(index + delta, 0, moved)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await api.put(`/api/live-quizzes/${id}`, {
        title,
        items: items.map((item) => ({ questionId: String(item.questionId), seconds: Number(item.seconds) })),
      })
      apply(response.data)
      setMessage({ ok: true, text: 'Saved.' })
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not save the live quiz.') })
    } finally {
      setBusy(false)
    }
  }

  async function startGame() {
    if (dirty && !window.confirm('You have unsaved changes. Start the game with the last saved version?')) return
    setBusy(true)
    try {
      const response = await api.post('/api/live-games', { quizId: id })
      navigate(`/live-games/${response.data.id}/host`)
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not start a game.') })
      setBusy(false)
    }
  }

  async function deleteQuiz() {
    if (!window.confirm(`Delete "${quiz.title}"? This can't be undone.`)) return
    try {
      await api.delete(`/api/live-quizzes/${id}`)
      navigate(`/classes/${quiz.classId}`)
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not delete the live quiz.') })
    }
  }

  if (!me) return null
  if (!quiz) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      </div>
    )
  }

  const totalSeconds = items.reduce((sum, item) => sum + Number(item.seconds), 0)
  const addedIds = new Set(items.map((item) => String(item.questionId)))

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/classes/${quiz.classId}`} style={linkStyle}>← Back to class</Link></p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: colors.muted, maxWidth: '640px' }}>
        Live quiz title
        <input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true) }} maxLength={200} style={{ ...inputStyle, fontSize: '1.1rem' }} />
      </label>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
        {items.length} question{items.length === 1 ? '' : 's'} · {formatSeconds(totalSeconds)} of answering time · up to 1,000 points per question, more for faster correct answers
      </p>

      <h3 style={sectionTitleStyle}>Questions ({items.length})</h3>
      {items.length === 0 && <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No questions yet. Add some from your question bank below.</p>}
      {items.map((item, index) => (
        <article key={String(item.questionId)} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <span style={{ fontSize: '0.75rem', color: colors.primary }}>{index + 1}. {TYPE_LABELS[item.type]}</span>
              <p style={{ margin: '0.2rem 0 0', whiteSpace: 'pre-wrap' }}>{item.prompt}</p>
              <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
                {item.options.map((option) => (
                  <li key={option.id} style={{ color: option.correct ? colors.success : colors.muted }}>{option.correct ? '✓ ' : ''}{option.text}</li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', color: colors.muted, display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                Time
                <select value={item.seconds} onChange={(event) => change((current) => current.map((it, i) => (i === index ? { ...it, seconds: Number(event.target.value) } : it)))} aria-label={`Time for question ${index + 1}`} style={{ ...inputStyle, padding: '0.3rem' }}>
                  {SECONDS_CHOICES.map((seconds) => <option key={seconds} value={seconds}>{seconds} s</option>)}
                </select>
              </label>
              <button onClick={() => moveItem(index, -1)} disabled={index === 0} style={smallButton} aria-label="Move up">↑</button>
              <button onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} style={smallButton} aria-label="Move down">↓</button>
              <button onClick={() => change((current) => current.filter((_, i) => i !== index))} style={smallButton} aria-label="Remove from quiz">✕</button>
            </div>
          </div>
        </article>
      ))}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem', alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !dirty} style={{ ...buttonStyle, opacity: busy || !dirty ? 0.6 : 1 }}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        <button onClick={startGame} disabled={busy || !quiz.items.length} style={{ ...buttonStyle, background: colors.successSolid, boxShadow: `0 3px 0 ${colors.successSolidDark}` }}>▶ Start game</button>
        <button onClick={deleteQuiz} disabled={busy} style={dangerButtonStyle}>Delete live quiz</button>
        {message && <span role="status" style={{ ...messageStyle(message.ok), marginTop: 0 }}>{message.text}</span>}
      </div>

      <PastGames quizId={id} />

      <QuestionPicker
        addedIds={addedIds}
        types={LIVE_TYPES}
        onAdd={(question) => change((current) => [...current, { ...question, questionId: question._id, seconds: DEFAULT_SECONDS }])}
      />
    </div>
  )
}

// Games already played with this quiz, with the winner; expands to the full standings.
function PastGames({ quizId }) {
  const [games, setGames] = useState([])
  const [open, setOpen] = useState(null) // { id, players, questions }

  useEffect(() => {
    api.get('/api/live-games', { params: { quizId } }).then((response) => setGames(response.data)).catch(() => setGames([]))
  }, [quizId])

  async function toggle(gameId) {
    if (open?.id === gameId) return setOpen(null)
    const response = await api.get(`/api/live-games/${gameId}`).catch(() => null)
    if (response) setOpen(response.data)
  }

  if (!games.length) return null
  return (
    <section>
      <h3 style={sectionTitleStyle}>Past games</h3>
      {games.map((game) => (
        <div key={game.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span>{new Date(game.playedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {game.playerCount} players{game.winner ? ` · 🏆 ${game.winner.name} (${game.winner.score})` : ''}</span>
            <button onClick={() => toggle(game.id)} style={smallButton}>{open?.id === game.id ? 'Hide' : 'Results'}</button>
          </div>
          {open?.id === game.id && (
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.6rem', fontSize: '0.85rem' }}>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', flex: '1 1 220px' }}>
                {open.players.map((player) => (
                  <li key={player.studentId}>{player.name}: {player.score} pts, {player.correctCount} correct</li>
                ))}
              </ol>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', flex: '2 1 320px', color: colors.muted }}>
                {open.questions.map((question) => (
                  <li key={question.number}>
                    Q{question.number}: {question.stats ? `${question.stats.correctCount}/${question.stats.answeredCount} correct` : 'not played'} · {question.prompt.slice(0, 80)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
