import { useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { TYPE_LABELS } from './QuestionEditor.jsx'
import { buttonStyle, cardStyle, colors, ghostButtonStyle, inputStyle, messageStyle } from '../styles.js'

const MAX_COUNT = { mcq: 5, multi: 5, short: 5, code: 2 }
const badgeStyle = { fontSize: '0.72rem', fontWeight: 800, padding: '0.1rem 0.5rem', borderRadius: '999px', border: `1px solid ${colors.border}` }

// For coding drafts the server ran the AI's own reference solution against its tests.
function CheckBadge({ check }) {
  if (!check) return null
  if (check.verdict === 'Accepted') {
    return <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', fontWeight: 700, color: colors.success }}>✓ The reference solution passes all {check.total} tests in the judge.</p>
  }
  return (
    <p role="alert" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', fontWeight: 700, color: colors.danger }}>
      ⚠ {check.verdict === 'Not checked' ? 'The judge could not check this draft.' : `The AI's own solution fails ${check.total - check.passed} of ${check.total} tests (${check.verdict}).`} Fix the tests or the solution before saving.
    </p>
  )
}

// AI drafts for the question bank. The teacher describes a topic, gets drafts, and opens each
// one in the normal editor to review and save it. Nothing is saved without that step.
export default function AiGenerator({ drafts, setDrafts, onReview, preview }) {
  const [form, setForm] = useState({ topic: '', type: 'mcq', count: 3, difficulty: 'medium', notes: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: field === 'count' ? Number(event.target.value) : event.target.value }))

  function setType(event) {
    const type = event.target.value
    setForm((current) => ({ ...current, type, count: Math.min(current.count, MAX_COUNT[type]) }))
  }

  async function generate(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const response = await api.post('/api/questions/generate', form, { timeout: 120000 })
      setDrafts(response.data.drafts.map((draft, i) => ({ ...draft, key: `${Date.now()}-${i}` })))
    } catch (requestError) {
      setMessage(errorMessage(requestError, 'Could not generate questions.'))
    } finally {
      setBusy(false)
    }
  }

  const field = { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 700 }

  return (
    <section style={{ ...cardStyle, marginTop: '1rem' }}>
      <h3 style={{ margin: 0 }}>✨ Generate questions with AI</h3>
      <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0.25rem 0 0.75rem' }}>
        You get drafts to review. Nothing is added to your bank until you open a draft, check it and press Save.
      </p>
      <form onSubmit={generate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <label style={{ ...field, gridColumn: '1 / -1' }}>Topic
          <input value={form.topic} onChange={set('topic')} required minLength={3} maxLength={300} placeholder="e.g. JavaScript array methods (map, filter, reduce)" style={inputStyle} />
        </label>
        <label style={field}>Type
          <select value={form.type} onChange={setType} style={inputStyle}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label style={field}>How many
          <select value={form.count} onChange={set('count')} style={inputStyle}>
            {Array.from({ length: MAX_COUNT[form.type] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label style={field}>Difficulty
          <select value={form.difficulty} onChange={set('difficulty')} style={inputStyle}>
            {['easy', 'medium', 'hard'].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label style={{ ...field, gridColumn: '1 / -1' }}>Notes for the AI (optional)
          <input value={form.notes} onChange={set('notes')} maxLength={1000} placeholder="e.g. for first-year students; avoid trick questions" style={inputStyle} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Writing questions…' : 'Generate drafts'}</button>
          {busy && <span style={{ fontSize: '0.8rem', color: colors.muted }}>This can take up to a minute{form.type === 'code' ? ' (coding drafts are also checked in the judge)' : ''}.</span>}
        </div>
      </form>
      {message && <p role="alert" style={messageStyle(false)}>{message}</p>}

      {drafts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
          <strong>{drafts.length} draft{drafts.length === 1 ? '' : 's'} to review</strong>
          {drafts.map((draft) => (
            <article key={draft.key} style={{ border: `2px dashed ${colors.border}`, borderRadius: '12px', padding: '0.8rem 1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ ...badgeStyle, color: colors.primary }}>AI draft · {TYPE_LABELS[draft.type]}</span>
                <span style={badgeStyle}>{draft.difficulty}</span>
                {draft.tags.map((tag) => <span key={tag} style={badgeStyle}>#{tag}</span>)}
              </div>
              <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{draft.prompt}</p>
              {preview(draft)}
              <CheckBadge check={draft.check} />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button onClick={() => onReview(draft)} style={{ ...buttonStyle, padding: '0.35rem 0.8rem' }}>Review &amp; save</button>
                <button onClick={() => setDrafts((list) => list.filter((d) => d.key !== draft.key))} style={{ ...ghostButtonStyle, padding: '0.35rem 0.8rem' }}>Discard</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
