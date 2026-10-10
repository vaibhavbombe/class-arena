import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { TYPE_LABELS } from '../components/QuestionEditor.jsx'
import QuestionPicker from '../components/QuestionPicker.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, colors, dangerButtonStyle, ghostButtonStyle, inputStyle, linkStyle, messageStyle, sectionTitleStyle, widePageStyle } from '../styles.js'
import { StatusBadge, fromLocalInput, toLocalInput, windowText } from '../testFormat.jsx'

const labelStyle = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: colors.muted }
const cardStyle = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.7rem 0.9rem', marginTop: '0.5rem' }
const smallButton = { ...ghostButtonStyle, padding: '0.2rem 0.5rem' }

function settingsFrom(test) {
  return {
    title: test.title,
    instructions: test.instructions,
    durationMinutes: test.durationMinutes,
    opensAt: toLocalInput(test.opensAt),
    closesAt: toLocalInput(test.closesAt),
    shuffleQuestions: test.shuffleQuestions,
    shuffleOptions: test.shuffleOptions,
  }
}

function AnswerKey({ item }) {
  if (item.type === 'short') {
    return <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: colors.success }}>Accepts: {item.acceptedAnswers.join(' · ')}</p>
  }
  return (
    <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
      {item.options.map((option) => (
        <li key={option.id} style={{ color: option.correct ? colors.success : colors.muted }}>{option.correct ? '✓ ' : ''}{option.text}</li>
      ))}
    </ul>
  )
}

export default function TestEditor() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const [test, setTest] = useState(null)
  const [settings, setSettings] = useState(null)
  const [items, setItems] = useState([]) // [{ questionId, points, prompt, type, ... }]
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  function applyTest(data) {
    setTest(data)
    setSettings(settingsFrom(data))
    setItems(data.items)
    setDirty(false)
  }

  useEffect(() => {
    api.get(`/api/tests/${id}`)
      .then((response) => applyTest(response.data))
      .catch((requestError) => setMessage({ ok: false, text: errorMessage(requestError, 'Could not load this test.') }))
  }, [id])

  const isDraft = test?.status === 'draft'

  function setField(field, value) {
    setSettings((current) => ({ ...current, [field]: value }))
    setDirty(true)
  }

  function addQuestion(question) {
    setItems((current) => [...current, { ...question, questionId: question._id, points: 1 }])
    setDirty(true)
  }

  function updateItem(index, changes) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)))
    setDirty(true)
  }

  function moveItem(index, delta) {
    setItems((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(index + delta, 0, moved)
      return next
    })
    setDirty(true)
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index))
    setDirty(true)
  }

  function payload() {
    const base = {
      title: settings.title,
      instructions: settings.instructions,
      closesAt: fromLocalInput(settings.closesAt),
    }
    if (!isDraft) return base // published: only these may change
    return {
      ...base,
      durationMinutes: Number(settings.durationMinutes),
      opensAt: fromLocalInput(settings.opensAt),
      shuffleQuestions: settings.shuffleQuestions,
      shuffleOptions: settings.shuffleOptions,
      items: items.map((item) => ({ questionId: String(item.questionId), points: Number(item.points) })),
    }
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await api.put(`/api/tests/${id}`, payload())
      applyTest(response.data)
      setMessage({ ok: true, text: 'Saved.' })
      return true
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not save the test.') })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!window.confirm('Publish this test? Students in the class will see it, and its questions, points and timing will be locked. You can still change the title, instructions and closing time.')) return
    if (dirty && !(await save())) return
    setBusy(true)
    try {
      const response = await api.post(`/api/tests/${id}/publish`)
      applyTest(response.data)
      setMessage({ ok: true, text: 'Published. Students in the class can now see it.' })
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not publish the test.') })
    } finally {
      setBusy(false)
    }
  }

  async function deleteTest() {
    if (!window.confirm(`Delete "${test.title}"? This can't be undone.`)) return
    try {
      await api.delete(`/api/tests/${id}`)
      navigate(`/classes/${test.classId}`)
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not delete the test.') })
    }
  }

  if (!me) return null
  if (!test || !settings) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      </div>
    )
  }

  const totalPoints = items.reduce((sum, item) => sum + (Number(item.points) || 0), 0)
  const addedIds = new Set(items.map((item) => String(item.questionId)))

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/classes/${test.classId}`} style={linkStyle}>← Back to class</Link></p>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{test.title}</h2>
        <StatusBadge status={test.status} />
        {!isDraft && <Link to={`/tests/${id}/results`} style={{ ...linkStyle, marginLeft: 'auto' }}>View results →</Link>}
      </div>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
        {items.length} question{items.length === 1 ? '' : 's'} · {totalPoints} points · {settings.durationMinutes} min · {windowText(test)}
      </p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '640px' }}>
        <h3 style={sectionTitleStyle}>Settings</h3>
        <label style={labelStyle}>
          Title
          <input value={settings.title} onChange={(event) => setField('title', event.target.value)} maxLength={200} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Instructions for students
          <textarea value={settings.instructions} onChange={(event) => setField('instructions', event.target.value)} rows={3} maxLength={5000} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={labelStyle}>
            Duration (minutes)
            <input type="number" min={1} max={600} value={settings.durationMinutes} onChange={(event) => setField('durationMinutes', event.target.value)} disabled={!isDraft} style={{ ...inputStyle, width: '8rem' }} />
          </label>
          <label style={labelStyle}>
            Opens (optional)
            <input type="datetime-local" value={settings.opensAt} onChange={(event) => setField('opensAt', event.target.value)} disabled={!isDraft} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Closes (optional)
            <input type="datetime-local" value={settings.closesAt} onChange={(event) => setField('closesAt', event.target.value)} style={inputStyle} />
          </label>
        </div>
        <p style={{ color: colors.muted, fontSize: '0.8rem', margin: 0 }}>
          Each student gets the full duration from when they start, but never past the closing time.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={settings.shuffleQuestions} onChange={(event) => setField('shuffleQuestions', event.target.checked)} disabled={!isDraft} />
            Shuffle question order per student
          </label>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={settings.shuffleOptions} onChange={(event) => setField('shuffleOptions', event.target.checked)} disabled={!isDraft} />
            Shuffle answer options
          </label>
        </div>
        {!isDraft && (
          <p style={{ color: colors.muted, fontSize: '0.8rem', margin: 0 }}>
            This test is published: questions, points, duration and opening time are locked. Title, instructions and closing time can still change.
          </p>
        )}
      </section>

      <h3 style={sectionTitleStyle}>Questions ({items.length})</h3>
      {items.length === 0 && <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No questions yet. Add some from your question bank below.</p>}
      {items.map((item, index) => (
        <article key={String(item.questionId)} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '0.75rem', color: colors.primary }}>{index + 1}. {TYPE_LABELS[item.type]}</span>
              <p style={{ margin: '0.2rem 0 0', whiteSpace: 'pre-wrap' }}>{item.prompt}</p>
              <AnswerKey item={item} />
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
              {isDraft ? (
                <>
                  <label style={{ fontSize: '0.8rem', color: colors.muted, display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    pts
                    <input type="number" min={1} max={100} value={item.points} onChange={(event) => updateItem(index, { points: event.target.value })} aria-label={`Points for question ${index + 1}`} style={{ ...inputStyle, width: '4rem', padding: '0.3rem' }} />
                  </label>
                  <button onClick={() => moveItem(index, -1)} disabled={index === 0} style={smallButton} aria-label="Move up">↑</button>
                  <button onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} style={smallButton} aria-label="Move down">↓</button>
                  <button onClick={() => removeItem(index)} style={smallButton} aria-label="Remove from test">✕</button>
                </>
              ) : (
                <span style={{ fontSize: '0.8rem', color: colors.muted }}>{item.points} pts</span>
              )}
            </div>
          </div>
        </article>
      ))}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem', alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !dirty} style={{ ...buttonStyle, opacity: busy || !dirty ? 0.6 : 1 }}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        {isDraft && <button onClick={publish} disabled={busy || items.length === 0} style={{ ...ghostButtonStyle, color: colors.success, borderColor: colors.success }}>Publish</button>}
        <button onClick={deleteTest} disabled={busy} style={dangerButtonStyle}>Delete test</button>
        {message && <span role="status" style={{ ...messageStyle(message.ok), marginTop: 0 }}>{message.text}</span>}
      </div>

      {isDraft && <QuestionPicker addedIds={addedIds} onAdd={addQuestion} />}
    </div>
  )
}
