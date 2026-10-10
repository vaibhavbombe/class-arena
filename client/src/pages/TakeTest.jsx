import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import AttemptReview from '../components/AttemptReview.jsx'
import { errorMessage } from '../session.js'
import { buttonStyle, colors, inputStyle, linkStyle, messageStyle, widePageStyle } from '../styles.js'
import { StatusBadge, formatWhen, windowText } from '../testFormat.jsx'

const SAVE_DELAY_MS = 800
const RETRY_MS = 3000

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

const isAnswered = (answer) => Boolean(answer && ((answer.selectedOptionIds && answer.selectedOptionIds.length) || (answer.text && answer.text.trim())))

export default function TakeTest({ me }) {
  const { id } = useParams()
  const [outline, setOutline] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [answers, setAnswers] = useState({}) // index -> { selectedOptionIds, text }
  const [saveState, setSaveState] = useState('saved') // saved | pending | saving | error
  const [remaining, setRemaining] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const pending = useRef(new Map()) // answers changed but not yet saved
  const saveTimer = useRef(null)
  const clockOffset = useRef(0) // server time minus this computer's time
  const submitting = useRef(false)

  function applyAttempt(data) {
    // The countdown uses the server's clock, corrected for this computer's clock being off.
    clockOffset.current = new Date(data.serverNow).getTime() - Date.now()
    setAttempt(data)
    if (data.questions) {
      setAnswers(Object.fromEntries(data.questions.map((question) => [question.index, question.answer])))
    }
  }

  useEffect(() => {
    api.get(`/api/tests/${id}`)
      .then((response) => setOutline(response.data))
      .catch((requestError) => setMessage({ ok: false, text: errorMessage(requestError, 'Could not load this test.') }))
    api.get(`/api/tests/${id}/attempt`)
      .then((response) => applyAttempt(response.data))
      .catch(() => setAttempt(null)) // not started yet
  }, [id])

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current)
    if (!pending.current.size) return true
    const batch = [...pending.current.entries()].map(([index, answer]) => ({ index, ...answer }))
    pending.current.clear()
    setSaveState('saving')
    try {
      await api.put(`/api/tests/${id}/attempt/answers`, { answers: batch })
      if (!pending.current.size) setSaveState('saved')
      return true
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        // Time is up or it was already submitted: reload to show the submitted state.
        const response = await api.get(`/api/tests/${id}/attempt`).catch(() => null)
        if (response) applyAttempt(response.data)
        return false
      }
      // Network trouble: put the answers back (unless newer ones replaced them) and retry.
      for (const { index, ...answer } of batch) if (!pending.current.has(index)) pending.current.set(index, answer)
      setSaveState('error')
      saveTimer.current = setTimeout(flush, RETRY_MS)
      return false
    }
  }, [id])

  function setAnswer(index, answer) {
    setAnswers((current) => ({ ...current, [index]: answer }))
    pending.current.set(index, answer)
    setSaveState('pending')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  const submit = useCallback(async ({ auto = false } = {}) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    clearTimeout(saveTimer.current)
    const batch = [...pending.current.entries()].map(([index, answer]) => ({ index, ...answer }))
    try {
      const response = await api.post(`/api/tests/${id}/attempt/submit`, batch.length ? { answers: batch } : {})
      pending.current.clear()
      setSaveState('saved')
      applyAttempt(response.data)
      if (auto) setMessage({ ok: true, text: "Time's up. Your answers were submitted." })
    } catch (requestError) {
      submitting.current = false
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not submit. Check your connection and try again.') })
    } finally {
      setBusy(false)
    }
  }, [id])

  const inProgress = attempt?.status === 'in_progress'

  // Countdown; submits automatically at zero. (The server enforces the deadline anyway.)
  useEffect(() => {
    if (!inProgress) return
    function tick() {
      const left = new Date(attempt.deadline).getTime() - (Date.now() + clockOffset.current)
      setRemaining(left)
      if (left <= 0) submit({ auto: true })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [inProgress, attempt?.deadline, submit])

  // Warn before closing the tab with unsaved answers.
  useEffect(() => {
    if (!inProgress) return
    function warn(event) {
      if (pending.current.size) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [inProgress])

  async function start() {
    if (!window.confirm(`Start "${outline.title}"? You'll have ${outline.durationMinutes} minutes, and the timer can't be paused.`)) return
    setBusy(true)
    try {
      const response = await api.post(`/api/tests/${id}/attempt`)
      applyAttempt(response.data)
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not start the test.') })
    } finally {
      setBusy(false)
    }
  }

  async function confirmSubmit() {
    const unanswered = attempt.questions.filter((question) => !isAnswered(answers[question.index])).length
    const note = unanswered ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. ` : ''
    if (!window.confirm(`${note}Submit your answers? You can't change them afterwards.`)) return
    submit()
  }

  const backLink = outline && <p><Link to={`/classes/${outline.classId}`} style={linkStyle}>← Back to class</Link></p>

  if (!outline) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      </div>
    )
  }

  // Submitted
  if (attempt && !inProgress) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {backLink}
        <h2>{outline.title}</h2>
        {message && <p role="status" style={messageStyle(message.ok)}>{message.text}</p>}
        {attempt.review ? (
          <AttemptReview review={attempt.review} />
        ) : (
          <>
            <p style={messageStyle(true)}>
              Submitted {formatWhen(attempt.submittedAt)}{attempt.submittedBy === 'timeout' ? ' (automatically, when time ran out)' : ''}.
            </p>
            <p style={{ color: colors.muted, fontSize: '0.9rem' }}>
              {attempt.closesAt
                ? `Your score and the correct answers will appear here when the test closes (${formatWhen(attempt.closesAt)}), or earlier if your teacher releases them.`
                : 'Your score and the correct answers will appear here when your teacher releases them.'}
            </p>
          </>
        )}
      </div>
    )
  }

  // Not started
  if (!attempt) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {backLink}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{outline.title}</h2>
          <StatusBadge status={outline.status} />
        </div>
        <p style={{ color: colors.muted }}>
          {outline.questionCount} questions · {outline.totalPoints} points · {outline.durationMinutes} minutes · {windowText(outline)}
        </p>
        {outline.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{outline.instructions}</p>}
        {outline.status === 'open' && (
          <>
            <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
              Once you start, you have {outline.durationMinutes} minutes{outline.closesAt ? ' (or until the test closes, if that comes first)' : ''}. Answers save automatically.
            </p>
            <button onClick={start} disabled={busy} style={buttonStyle}>{busy ? 'Starting…' : 'Start test'}</button>
          </>
        )}
        {outline.status === 'upcoming' && <p style={messageStyle(true)}>This test opens {formatWhen(outline.opensAt)}.</p>}
        {outline.status === 'closed' && <p style={messageStyle(false)}>This test has closed.</p>}
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      </div>
    )
  }

  // In progress
  const lowTime = remaining !== null && remaining < 60 * 1000
  const answeredCount = attempt.questions.filter((question) => isAnswered(answers[question.index])).length
  const saveLabel = { saved: 'All answers saved', pending: 'Saving…', saving: 'Saving…', error: "Can't reach the server — retrying…" }[saveState]

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <h2 style={{ marginBottom: '0.25rem' }}>{attempt.title}</h2>
      {attempt.instructions && <p style={{ color: colors.muted, whiteSpace: 'pre-wrap', marginTop: 0 }}>{attempt.instructions}</p>}

      <div style={{ position: 'sticky', top: 0, zIndex: 1, background: colors.bg, borderBottom: `1px solid ${colors.border}`, padding: '0.6rem 0', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span role="timer" aria-live="off" style={{ fontSize: '1.4rem', fontWeight: 'bold', color: lowTime ? colors.danger : colors.text }}>
          {remaining === null ? '--:--' : formatRemaining(remaining)}
        </span>
        <span style={{ color: colors.muted, fontSize: '0.85rem' }}>{answeredCount}/{attempt.questions.length} answered</span>
        <span role="status" style={{ fontSize: '0.8rem', color: saveState === 'error' ? colors.danger : colors.muted }}>{saveLabel}</span>
        <button onClick={confirmSubmit} disabled={busy} style={{ ...buttonStyle, marginLeft: 'auto' }}>{busy ? 'Submitting…' : 'Submit'}</button>
      </div>
      {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}

      {attempt.questions.map((question) => {
        const answer = answers[question.index] || { selectedOptionIds: [], text: '' }
        const name = `q${question.index}`
        return (
          <fieldset key={question.index} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '1rem 1.15rem', marginTop: '1rem', boxShadow: 'var(--shadow)' }}>
            <legend style={{ fontSize: '0.8rem', color: colors.primary, padding: '0 0.3rem' }}>
              Question {question.number} · {question.points} pt{question.points > 1 ? 's' : ''}{question.type === 'multi' ? ' · select all that apply' : ''}
            </legend>
            <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{question.prompt}</p>
            {question.type === 'short' ? (
              <input
                value={answer.text}
                onChange={(event) => setAnswer(question.index, { selectedOptionIds: [], text: event.target.value })}
                maxLength={1000}
                aria-label={`Answer to question ${question.number}`}
                placeholder="Your answer"
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {question.options.map((option) => {
                  const checked = answer.selectedOptionIds.includes(option.id)
                  return (
                    <label key={option.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input
                        type={question.type === 'mcq' ? 'radio' : 'checkbox'}
                        name={name}
                        checked={checked}
                        onChange={(event) => {
                          const ids = question.type === 'mcq'
                            ? [option.id]
                            : event.target.checked
                              ? [...answer.selectedOptionIds, option.id]
                              : answer.selectedOptionIds.filter((selected) => selected !== option.id)
                          setAnswer(question.index, { selectedOptionIds: ids, text: '' })
                        }}
                      />
                      <span>{option.text}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>
        )
      })}

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={confirmSubmit} disabled={busy} style={buttonStyle}>{busy ? 'Submitting…' : 'Submit answers'}</button>
      </div>
    </div>
  )
}
