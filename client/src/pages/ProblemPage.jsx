import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { runInBrowser } from '../code/runInBrowser.js'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, cardStyle, cellStyle, colors, dangerButtonStyle, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle, widePageStyle } from '../styles.js'

const CodeEditor = lazy(() => import('../code/CodeEditor.jsx'))
const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"
const json = (value) => JSON.stringify(value)
const draftKey = (id) => `classarena:draft:${id}`

// The prompt without its first line when that line is the title (already shown above it).
function promptBody(problem) {
  const lines = problem.prompt.split(/\r?\n/)
  if (lines[0].trim() !== problem.title) return problem.prompt
  return lines.slice(1).join('\n').trim() || problem.prompt
}

function readDraft(id) {
  try { return localStorage.getItem(draftKey(id)) } catch { return null }
}
function saveDraft(id, code) {
  try { localStorage.setItem(draftKey(id), code) } catch { /* storage blocked: draft just isn't kept */ }
}

const VERDICT_LOOK = {
  Accepted: { color: 'success', icon: '✓' },
  'Wrong Answer': { color: 'danger', icon: '✗' },
}
const verdictColor = (verdict) => (verdict === 'Accepted' ? colors.success : verdict ? colors.danger : colors.muted)

function ResultPanel({ title, result }) {
  if (!result) return null
  const look = VERDICT_LOOK[result.verdict] || { icon: '⚠' }
  return (
    <section style={{ ...cardStyle, marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '1.1rem', color: verdictColor(result.verdict) }}>{look.icon} {result.verdict}{result.verdict === 'Accepted' && title === 'Submission' ? ' 🎉' : ''}</strong>
        <span style={{ color: colors.muted, fontWeight: 700 }}>{title}: {result.passed} of {result.total} tests passed</span>
      </div>
      {result.error && <pre style={{ fontFamily: MONO, color: colors.danger, whiteSpace: 'pre-wrap', margin: '0.5rem 0 0' }}>{result.error}</pre>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
        {result.tests.map((test) => (
          <div key={test.index} style={{ borderLeft: `4px solid ${test.passed ? colors.success : colors.danger}`, paddingLeft: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 800 }}>
              {test.passed ? '✓' : '✗'} {test.kind === 'hidden' ? `Hidden test ${test.number}` : `Sample ${test.number ?? test.index + 1}`}
              <span style={{ color: colors.muted, fontWeight: 600 }}> · {test.verdict} · {test.timeMs} ms</span>
            </div>
            {test.kind !== 'hidden' && (
              <div style={{ fontFamily: MONO, marginTop: '0.2rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.1rem 0.6rem' }}>
                <span style={{ color: colors.muted }}>input</span><span>{json(test.input)}</span>
                <span style={{ color: colors.muted }}>expected</span><span>{json(test.expected)}</span>
                {test.error
                  ? <><span style={{ color: colors.muted }}>error</span><span style={{ color: colors.danger }}>{test.error}</span></>
                  : test.output !== undefined && <><span style={{ color: colors.muted }}>got</span><span style={{ color: test.passed ? colors.text : colors.danger }}>{json(test.output)}</span></>}
                {test.logs?.length > 0 && <><span style={{ color: colors.muted }}>console</span><span style={{ whiteSpace: 'pre-wrap' }}>{test.logs.join('\n')}</span></>}
              </div>
            )}
          </div>
        ))}
      </div>
      {title === 'Submission' && result.tests.some((t) => t.kind === 'hidden' && !t.passed) && (
        <p style={{ color: colors.muted, fontSize: '0.8rem', marginBottom: 0 }}>Hidden tests don't show their inputs. Think about edge cases: empty input, negatives, large values.</p>
      )}
    </section>
  )
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
                <thead><tr><th style={cellStyle}>Student</th><th style={cellStyle}>Status</th><th style={cellStyle}>Best</th><th style={cellStyle}>Attempts</th><th style={cellStyle}>Last</th><th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Code</span></th></tr></thead>
                <tbody>
                  {problem.students.map((row) => (
                    <tr key={row.studentId}>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>{row.name}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: row.solved ? colors.success : colors.muted }}>{row.solved ? '✓ Solved' : 'Trying'}</td>
                      <td style={cellStyle}>{row.best ? `${row.best.passed}/${row.best.total}` : '—'}</td>
                      <td style={cellStyle}>{row.attempts}</td>
                      <td style={{ ...cellStyle, color: colors.muted }}>{new Date(row.lastAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        <button onClick={async () => { const r = await api.get(`/api/problems/${id}/submissions/${row.latestSubmissionId}`).catch(() => null); if (r) { setCode(r.data.code); setSubmitResult(r.data); window.scrollTo({ top: 0, behavior: 'smooth' }) } }} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>View latest code</button>
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
