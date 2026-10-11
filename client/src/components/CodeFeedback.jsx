import { useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { cardStyle, colors, ghostButtonStyle, messageStyle } from '../styles.js'

function Points({ title, items, color }) {
  if (!items?.length) return null
  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem' }}>
        {items.map((item, i) => <li key={i} style={{ fontSize: '0.9rem' }}>{item}</li>)}
      </ul>
    </div>
  )
}

// A review of one judged submission. Students can ask for it once per submission (the server
// saves it); staff only see a review the student already asked for.
export default function CodeFeedback({ problemId, submission, canRequest, onFeedback }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!submission || submission.status !== 'done') return null
  const feedback = submission.feedback

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const response = await api.post(`/api/problems/${problemId}/submissions/${submission.id}/feedback`)
      onFeedback(response.data)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not get feedback.'))
    } finally {
      setBusy(false)
    }
  }

  if (!feedback) {
    if (!canRequest) return null
    return (
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <button onClick={ask} disabled={busy} style={ghostButtonStyle}>{busy ? 'Reading your code…' : '🧠 Get feedback on this code'}</button>
        <span style={{ fontSize: '0.78rem', color: colors.muted }}>A short review of what's good and what to improve. No code, no answers.</span>
        {error && <p role="alert" style={{ ...messageStyle(false), margin: 0, flexBasis: '100%' }}>{error}</p>}
      </div>
    )
  }

  return (
    <section style={{ ...cardStyle, marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <strong>🧠 Feedback{feedback.source === 'fallback' ? ' (standard)' : ''}</strong>
      <p style={{ margin: 0 }}>{feedback.summary}</p>
      <Points title="What's good" items={feedback.strengths} color={colors.success} />
      <Points title="To improve" items={feedback.improvements} color={colors.primary} />
      {feedback.complexity && <p style={{ margin: 0, fontSize: '0.85rem', color: colors.muted }}>⏱ {feedback.complexity}</p>}
      {feedback.source === 'ai' && <span style={{ fontSize: '0.72rem', color: colors.muted }}>Written by AI; it can be wrong.</span>}
    </section>
  )
}
