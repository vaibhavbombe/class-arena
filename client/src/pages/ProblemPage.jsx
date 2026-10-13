import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { MONO, ResultPanel, promptBody, verdictColor } from '../components/JudgeResult.jsx'
import CodeFeedback from '../components/CodeFeedback.jsx'
import { runInBrowser } from '../code/runInBrowser.js'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, cardStyle, cellStyle, colors, dangerButtonStyle, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle, widePageStyle } from '../styles.js'

const CodeEditor = lazy(() => import('../code/CodeEditor.jsx'))
const json = (value) => JSON.stringify(value)
const draftKey = (id) => `classarena:draft:${id}`

const FOCUS = { understanding: 'Understanding', approach: 'Approach', 'edge-cases': 'Edge cases', bug: 'Bug', syntax: 'Syntax', performance: 'Speed' }

// Up to 3 hints, one level at a time. The server writes them (AI, or a fixed hint if the AI is
// unavailable) and never includes code; the current editor code is sent as context.
function HintsCard({ problemId, hints, code, onHint }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const next = hints.length + 1

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const response = await api.post(`/api/problems/${problemId}/hints`, { code })
      onHint(response.data)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not get a hint.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 style={sectionTitleStyle}>Hints</h3>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {hints.map((hint) => (
          <div key={hint.level} style={{ borderLeft: `4px solid ${colors.primary}`, paddingLeft: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Hint {hint.level}{hint.focus ? ` · ${FOCUS[hint.focus] || hint.focus}` : ''}{hint.source === 'fallback' ? ' · standard hint' : ''}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', marginTop: '0.15rem' }}>{hint.text}</div>
          </div>
        ))}
        {next <= 3 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={ask} disabled={busy} style={ghostButtonStyle}>{busy ? 'Thinking…' : `💡 Get hint ${next} of 3`}</button>
            <span style={{ fontSize: '0.78rem', color: colors.muted }}>{next === 1 ? 'A question first, then where the problem is, then the change in words. Never code.' : next === 2 ? 'Next: where the problem is.' : 'Last: the change, in words.'}</span>
          </div>
        ) : (
          <span style={{ fontSize: '0.8rem', color: colors.muted }}>You've used all 3 hints for this problem.</span>
        )}
        {error && <p role="alert" style={{ ...messageStyle(false), margin: 0 }}>{error}</p>}
        <span style={{ fontSize: '0.72rem', color: colors.muted }}>AI hints can be wrong. Your teacher can see how many hints you used.</span>
      </div>
    </>
  )
}

function readDraft(id) {
  try { return localStorage.getItem(draftKey(id)) } catch { return null }
}
function saveDraft(id, code) {
  try { localStorage.setItem(draftKey(id), code) } catch { /* storage blocked: draft just isn't kept */ }
}

export default function ProblemPage() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const [problem, setProblem] = useState(null)
  const [code, setCode] = useState('')
  const [runResult, setRunResult] = useState(null)
  const [submitResult, setSubmitResult] = useState(null)
  const [busy, setBusy] = useState('') // '' | 'run' | 'submit'
  const [message, setMessage] = useState(null)
  const polling = useRef(null)
  const isStaff = me && me.user.role !== 'student'

  function load() {
    return api.get(`/api/problems/${id}`).then((response) => {
      setProblem(response.data)
      return response.data
    })
  }

  useEffect(() => {
    load()
      .then((data) => setCode(readDraft(id) ?? data.lastCode ?? data.starterCode))
      .catch((requestError) => setMessage({ ok: false, text: errorMessage(requestError, 'Could not load this problem.') }))
    return () => clearTimeout(polling.current)
  }, [id])

  function changeCode(next) {
    setCode(next)
    saveDraft(id, next) // keeps work across reloads on this device
  }

  async function run() {
    setBusy('run')
    setMessage(null)
    setRunResult(await runInBrowser({ code, functionName: problem.functionName, tests: problem.sampleTests, timeLimitMs: problem.timeLimitMs }))
    setBusy('')
  }

  async function poll(submissionId, tries = 0) {
    try {
      const response = await api.get(`/api/problems/${id}/submissions/${submissionId}`)
      if (response.data.status === 'done') {
        setSubmitResult(response.data)
        setBusy('')
        load()
        return
      }
    } catch {
      // keep trying; a blip shouldn't lose the result
    }
    if (tries > 90) {
      setBusy('')
      setMessage({ ok: false, text: 'Still judging. Refresh in a moment to see the result.' })
      return
    }
    polling.current = setTimeout(() => poll(submissionId, tries + 1), 1000)
  }

  async function submit() {
    setBusy('submit')
    setMessage(null)
    setSubmitResult(null)
    try {
      const response = await api.post(`/api/problems/${id}/submit`, { code })
      poll(response.data.id)
    } catch (requestError) {
      setBusy('')
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not submit.') })
    }
  }

  async function openSubmission(submissionId) {
    const response = await api.get(`/api/problems/${id}/submissions/${submissionId}`).catch(() => null)
    if (response) setSubmitResult(response.data)
  }

  async function removeProblem() {
    if (!window.confirm(`Remove "${problem.title}" from the class? Students' submissions for it are deleted too.`)) return
    await api.delete(`/api/problems/${id}`)
    navigate(`/classes/${problem.classId}`)
  }

  if (!me) return null
  if (!problem) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(false)}>{message.text}</p>}
      </div>
    )
  }

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/classes/${problem.classId}`} style={linkStyle}>← Back to class</Link></p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{problem.title}</h1>
        {!isStaff && problem.status === 'solved' && <span style={{ color: colors.success, fontWeight: 800 }}>✓ Solved</span>}
        {isStaff && <button onClick={removeProblem} style={{ ...dangerButtonStyle, marginLeft: 'auto' }}>Remove from class</button>}
      </div>
      <p style={{ color: colors.muted, fontWeight: 600, margin: '0.3rem 0 0' }}>
        JavaScript · write <code style={{ fontFamily: MONO }}>{problem.functionName}(…)</code> · {problem.timeLimitMs} ms per test · {problem.sampleTests.length} sample + {problem.hiddenTestCount} hidden tests
      </p>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'flex-start' }}>
        <section style={{ flex: '1 1 300px', minWidth: 0 }}>
          {/* The title is the prompt's first line; don't show it twice. */}
          <div style={{ ...cardStyle, whiteSpace: 'pre-wrap' }}>{promptBody(problem)}</div>
          <h3 style={sectionTitleStyle}>Examples</h3>
          {problem.sampleTests.map((test, i) => (
            <div key={i} style={{ ...cardStyle, fontFamily: MONO, fontSize: '0.85rem', marginTop: '0.5rem', padding: '0.6rem 0.9rem' }}>
              {problem.functionName}({test.input.map(json).join(', ')}) → {json(test.expected)}
            </div>
          ))}
          {!isStaff && <HintsCard problemId={id} hints={problem.hints || []} code={code} onHint={(hint) => setProblem((current) => ({ ...current, hints: [...(current.hints || []), hint] }))} />}
          {isStaff && (
            <>
              <h3 style={sectionTitleStyle}>Hidden tests (staff only)</h3>
              {problem.hiddenTests.map((test, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: '0.8rem', color: colors.muted }}>{problem.functionName}({test.input.map(json).join(', ')}) → {json(test.expected)}</div>
              ))}
            </>
          )}
        </section>

        <section style={{ flex: '2 1 420px', minWidth: 0 }}>
          <Suspense fallback={<div style={{ ...cardStyle, color: colors.muted }}>Loading editor…</div>}>
            <CodeEditor value={code} onChange={changeCode} />
          </Suspense>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={run} disabled={Boolean(busy)} style={ghostButtonStyle}>{busy === 'run' ? 'Running…' : '▶ Run samples'}</button>
            {!isStaff && <button onClick={submit} disabled={Boolean(busy)} style={buttonStyle}>{busy === 'submit' ? 'Judging…' : 'Submit'}</button>}
            <button onClick={() => window.confirm('Replace your code with the starter code?') && changeCode(problem.starterCode)} disabled={Boolean(busy)} style={{ ...ghostButtonStyle, marginLeft: 'auto' }}>Reset</button>
          </div>
          <p style={{ fontSize: '0.8rem', color: colors.muted, margin: '0.4rem 0 0' }}>
            {isStaff ? 'Run tries code against the samples in your browser.' : 'Run checks the samples in your browser. Submit is judged on the server with the hidden tests too.'}
          </p>
          {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
          <ResultPanel title="Run" result={runResult} />
          <ResultPanel title="Submission" result={submitResult} />
          <CodeFeedback problemId={id} submission={submitResult} canRequest={!isStaff} onFeedback={(feedback) => setSubmitResult((current) => ({ ...current, feedback }))} />
        </section>
      </div>

      {!isStaff && problem.submissions?.length > 0 && (
        <section>
          <h3 style={sectionTitleStyle}>Your submissions</h3>
          <div style={tableWrapStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead><tr><th style={cellStyle}>When</th><th style={cellStyle}>Verdict</th><th style={cellStyle}>Tests</th><th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Details</span></th></tr></thead>
              <tbody>
                {problem.submissions.map((s) => (
                  <tr key={s.id}>
                    <td style={cellStyle}>{new Date(s.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: verdictColor(s.verdict) }}>{s.status === 'queued' ? 'Judging…' : s.verdict}</td>
                    <td style={cellStyle}>{s.passed === null ? '—' : `${s.passed}/${s.total}`}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}><button onClick={() => openSubmission(s.id)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isStaff && (
        <section>
          <h3 style={sectionTitleStyle}>Students</h3>
          {problem.students.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: '0.9rem' }}>No submissions yet.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead><tr><th style={cellStyle}>Student</th><th style={cellStyle}>Status</th><th style={cellStyle}>Best</th><th style={cellStyle}>Attempts</th><th style={cellStyle}>Hints</th><th style={cellStyle}>Last</th><th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Code</span></th></tr></thead>
                <tbody>
                  {problem.students.map((row) => (
                    <tr key={row.studentId}>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>{row.name}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: row.solved ? colors.success : colors.muted }}>{row.solved ? '✓ Solved' : row.attempts ? 'Trying' : 'Not submitted'}</td>
                      <td style={cellStyle}>{row.best ? `${row.best.passed}/${row.best.total}` : '—'}</td>
                      <td style={cellStyle}>{row.attempts}</td>
                      <td style={cellStyle}>{row.hintsUsed ? `${row.hintsUsed}/3` : '—'}</td>
                      <td style={{ ...cellStyle, color: colors.muted }}>{row.lastAt ? new Date(row.lastAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        {row.latestSubmissionId && <button onClick={async () => { const r = await api.get(`/api/problems/${id}/submissions/${row.latestSubmissionId}`).catch(() => null); if (r) { setCode(r.data.code); setSubmitResult(r.data); window.scrollTo({ top: 0, behavior: 'smooth' }) } }} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>View latest code</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
