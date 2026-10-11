import { useState } from 'react'
import api from '../api.js'
import QuestionPicker from './QuestionPicker.jsx'
import { errorMessage } from '../session.js'
import { buttonStyle, cardStyle, colors, dangerButtonStyle, ghostButtonStyle, inputStyle, messageStyle, sectionTitleStyle } from '../styles.js'

const CODE_ONLY = ['code']
const label = (index) => String.fromCharCode(65 + index)

// <input type="datetime-local"> works in local time without a zone; the API takes ISO (UTC).
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const numberField = (value) => (value === '' ? '' : Number(value))

// Staff setup before the contest starts. Everything is checked again on the server.
export default function ContestSettings({ contest, onSaved, onDelete }) {
  const [form, setForm] = useState({
    title: contest.title,
    startsAt: toLocalInput(contest.startsAt),
    durationMinutes: contest.durationMinutes,
    penaltyMinutes: contest.penaltyMinutes,
    freezeMinutes: contest.freezeMinutes,
  })
  const [problems, setProblems] = useState(contest.problems.map((p) => ({ questionId: p.questionId, title: p.title })))
  const [picking, setPicking] = useState(false)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  async function request(action, fallback) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await action()
      onSaved(response.data)
      return true
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, fallback) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = () => request(() => api.put(`/api/contests/${contest.id}`, {
    title: form.title,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    durationMinutes: numberField(form.durationMinutes),
    penaltyMinutes: numberField(form.penaltyMinutes),
    freezeMinutes: numberField(form.freezeMinutes),
    ...(problems.length ? { problemIds: problems.map((p) => p.questionId) } : {}),
  }), 'Could not save.')

  async function saveThen(next) {
    if (await save()) await next()
  }

  function move(index, by) {
    setProblems((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(index + by, 0, item)
      return next
    })
  }

  const field = { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 700 }

  return (
    <section style={{ ...cardStyle, marginTop: '1rem' }}>
      <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>Set up</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        <label style={{ ...field, gridColumn: '1 / -1' }}>Title<input value={form.title} onChange={set('title')} maxLength={200} style={inputStyle} /></label>
        <label style={field}>Starts at<input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} style={inputStyle} /></label>
        <label style={field}>Duration (minutes)<input type="number" min={10} max={600} value={form.durationMinutes} onChange={set('durationMinutes')} style={inputStyle} /></label>
        <label style={field}>Penalty per wrong try (min)<input type="number" min={0} max={60} value={form.penaltyMinutes} onChange={set('penaltyMinutes')} style={inputStyle} /></label>
        <label style={field}>Freeze the last … minutes<input type="number" min={0} max={600} value={form.freezeMinutes} onChange={set('freezeMinutes')} style={inputStyle} /></label>
      </div>
      <p style={{ color: colors.muted, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
        Ranking: problems solved, then penalty (minutes to each solve + the penalty for every wrong try on solved problems). During the freeze students see the board as it was; you always see it live.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginTop: '1rem' }}>
        <h4 style={{ margin: 0 }}>Problems ({problems.length}/12)</h4>
        <button type="button" onClick={() => setPicking((open) => !open)} style={ghostButtonStyle}>{picking ? 'Close' : '+ Add coding question'}</button>
      </div>
      {picking && (
        <QuestionPicker
          types={CODE_ONLY}
          addedIds={new Set(problems.map((p) => p.questionId))}
          onAdd={(question) => setProblems((list) => (list.length >= 12 ? list : [...list, { questionId: question._id, title: question.prompt.split('\n')[0].slice(0, 80) }]))}
        />
      )}
      {problems.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No problems yet. Add coding questions from your bank.</p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {problems.map((p, i) => (
            <li key={p.questionId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ width: '1.5rem', color: colors.primary }}>{label(i)}</strong>
              <span style={{ flex: '1 1 160px', minWidth: 0 }}>{p.title}</span>
              <button type="button" aria-label={`Move ${label(i)} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.5rem' }}>↑</button>
              <button type="button" aria-label={`Move ${label(i)} down`} disabled={i === problems.length - 1} onClick={() => move(i, 1)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.5rem' }}>↓</button>
              <button type="button" aria-label={`Remove ${label(i)}`} onClick={() => setProblems((list) => list.filter((_, j) => j !== i))} style={{ ...ghostButtonStyle, padding: '0.2rem 0.5rem' }}>✕</button>
            </li>
          ))}
        </ol>
      )}

      {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="button" disabled={busy} onClick={save} style={ghostButtonStyle}>Save</button>
        {contest.published
          ? <button type="button" disabled={busy} onClick={() => request(() => api.post(`/api/contests/${contest.id}/publish`, { published: false }), 'Could not unpublish.')} style={ghostButtonStyle}>Unpublish</button>
          : <button type="button" disabled={busy} onClick={() => saveThen(() => request(() => api.post(`/api/contests/${contest.id}/publish`), 'Could not schedule.'))} style={buttonStyle}>Save &amp; schedule</button>}
        <button type="button" disabled={busy} onClick={() => window.confirm('Start the contest now for everyone in the class?') && saveThen(() => request(() => api.post(`/api/contests/${contest.id}/start`), 'Could not start.'))} style={buttonStyle}>▶ Start now</button>
        <button type="button" disabled={busy} onClick={onDelete} style={{ ...dangerButtonStyle, marginLeft: 'auto' }}>Delete</button>
      </div>
    </section>
  )
}
