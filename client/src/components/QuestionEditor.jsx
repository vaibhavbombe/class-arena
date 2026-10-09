import { useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, colors, errorStyle, ghostButtonStyle, inputStyle } from '../styles.js'

export const TYPE_LABELS = { mcq: 'Multiple choice', multi: 'Multi-select', short: 'Short answer' }

const emptyOptions = () => [{ text: '', correct: true }, { text: '', correct: false }]

// Turns a saved question (or nothing) into editable form state.
function toForm(question) {
  if (!question) {
    return { type: 'mcq', prompt: '', options: emptyOptions(), acceptedAnswers: [''], caseSensitive: false, explanation: '', tags: '', difficulty: 'medium' }
  }
  return {
    type: question.type,
    prompt: question.prompt,
    options: question.options?.map(({ text, correct }) => ({ text, correct })) || emptyOptions(),
    acceptedAnswers: question.acceptedAnswers?.length ? [...question.acceptedAnswers] : [''],
    caseSensitive: question.caseSensitive || false,
    explanation: question.explanation || '',
    tags: (question.tags || []).join(', '),
    difficulty: question.difficulty || 'medium',
  }
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: colors.muted }
const smallButton = { ...ghostButtonStyle, padding: '0.3rem 0.6rem' }

// Create (question = null) or edit an existing question.
export default function QuestionEditor({ question, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toForm(question))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  function setType(type) {
    setForm((current) => {
      let options = current.options
      // Switching to single choice keeps only the first correct option.
      if (type === 'mcq') {
        const first = options.findIndex((option) => option.correct)
        options = options.map((option, i) => ({ ...option, correct: i === (first === -1 ? 0 : first) }))
      }
      return { ...current, type, options }
    })
  }

  function updateOption(index, changes) {
    set('options', form.options.map((option, i) => (i === index ? { ...option, ...changes } : option)))
  }

  function markCorrect(index, checked) {
    if (form.type === 'mcq') {
      set('options', form.options.map((option, i) => ({ ...option, correct: i === index })))
    } else {
      updateOption(index, { correct: checked })
    }
  }

  function removeOption(index) {
    const options = form.options.filter((_, i) => i !== index)
    if (form.type === 'mcq' && !options.some((option) => option.correct) && options.length) options[0] = { ...options[0], correct: true }
    set('options', options)
  }

  function updateAnswer(index, value) {
    set('acceptedAnswers', form.acceptedAnswers.map((answer, i) => (i === index ? value : answer)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    const body = {
      type: form.type,
      prompt: form.prompt,
      explanation: form.explanation,
      difficulty: form.difficulty,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      ...(form.type === 'short'
        ? { acceptedAnswers: form.acceptedAnswers, caseSensitive: form.caseSensitive }
        : { options: form.options }),
    }
    try {
      const response = question
        ? await api.put(`/api/questions/${question._id}`, body)
        : await api.post('/api/questions', body)
      onSaved(response.data)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not save the question.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem' }}>{question ? 'Edit question' : 'New question'}</h3>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={labelStyle}>
          Type
          <select value={form.type} onChange={(event) => setType(event.target.value)} style={inputStyle}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Difficulty
          <select value={form.difficulty} onChange={(event) => set('difficulty', event.target.value)} style={inputStyle}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Question
        <textarea value={form.prompt} onChange={(event) => set('prompt', event.target.value)} required rows={3} maxLength={5000} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>

      {form.type !== 'short' ? (
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ ...labelStyle, marginBottom: '0.3rem' }}>
            Options: tick the {form.type === 'mcq' ? 'one correct answer' : 'correct answers'}
          </legend>
          {form.options.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type={form.type === 'mcq' ? 'radio' : 'checkbox'}
                name="correct"
                checked={option.correct}
                onChange={(event) => markCorrect(index, event.target.checked)}
                aria-label={`Option ${index + 1} is correct`}
              />
              <input value={option.text} onChange={(event) => updateOption(index, { text: event.target.value })} placeholder={`Option ${index + 1}`} required maxLength={500} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <button type="button" onClick={() => removeOption(index)} disabled={form.options.length <= 2} style={smallButton} aria-label={`Remove option ${index + 1}`}>✕</button>
            </div>
          ))}
          {form.options.length < 8 && (
            <button type="button" onClick={() => set('options', [...form.options, { text: '', correct: false }])} style={{ ...smallButton, alignSelf: 'flex-start' }}>+ Add option</button>
          )}
        </fieldset>
      ) : (
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ ...labelStyle, marginBottom: '0.3rem' }}>Accepted answers (any one counts as correct)</legend>
          {form.acceptedAnswers.map((answer, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={answer} onChange={(event) => updateAnswer(index, event.target.value)} placeholder={`Answer ${index + 1}`} required={index === 0} maxLength={200} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <button type="button" onClick={() => set('acceptedAnswers', form.acceptedAnswers.filter((_, i) => i !== index))} disabled={form.acceptedAnswers.length <= 1} style={smallButton} aria-label={`Remove answer ${index + 1}`}>✕</button>
            </div>
          ))}
          {form.acceptedAnswers.length < 10 && (
            <button type="button" onClick={() => set('acceptedAnswers', [...form.acceptedAnswers, ''])} style={{ ...smallButton, alignSelf: 'flex-start' }}>+ Add answer</button>
          )}
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: colors.muted }}>
            <input type="checkbox" checked={form.caseSensitive} onChange={(event) => set('caseSensitive', event.target.checked)} />
            Case sensitive (otherwise "paris" matches "Paris")
          </label>
        </fieldset>
      )}

      <label style={labelStyle}>
        Explanation (optional, shown to students with their results)
        <textarea value={form.explanation} onChange={(event) => set('explanation', event.target.value)} rows={2} maxLength={5000} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <label style={labelStyle}>
        Tags (comma separated)
        <input value={form.tags} onChange={(event) => set('tags', event.target.value)} placeholder="algebra, chapter-3" style={inputStyle} />
      </label>

      {error && <p role="alert" style={errorStyle}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Save question'}</button>
        <button type="button" onClick={onCancel} style={ghostButtonStyle}>Cancel</button>
      </div>
    </form>
  )
}
