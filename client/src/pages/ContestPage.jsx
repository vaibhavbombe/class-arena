import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import ContestSettings from '../components/ContestSettings.jsx'
import { CONTEST_STATUS } from '../components/ContestsPanel.jsx'
import { MONO, ResultPanel, promptBody, verdictColor } from '../components/JudgeResult.jsx'
import Scoreboard from '../components/Scoreboard.jsx'
import { runInBrowser } from '../code/runInBrowser.js'
import { connectSocket, emitAck } from '../socket.js'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { buttonStyle, cardStyle, cellStyle, colors, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle, widePageStyle } from '../styles.js'

const CodeEditor = lazy(() => import('../code/CodeEditor.jsx'))
const json = (value) => JSON.stringify(value)
const draftKey = (id, index) => `classarena:contest:${id}:${index}`
const readDraft = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const saveDraft = (key, code) => { try { localStorage.setItem(key, code) } catch { /* storage blocked */ } }

function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// The student's workspace for one problem: prompt, examples, editor, Run and Submit.
function ProblemWorkspace({ contestId, problem, canSubmit, lastCode, submissions, onSubmitted }) {
  const key = draftKey(contestId, problem.index)
  const [code, setCode] = useState(() => readDraft(key) ?? lastCode ?? problem.starterCode)
  const [runResult, setRunResult] = useState(null)
  const [submitResult, setSubmitResult] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const polling = useRef(null)
  useEffect(() => () => clearTimeout(polling.current), [])

  function change(next) {
    setCode(next)
    saveDraft(key, next)
  }

  async function run() {
    setBusy('run')
    setRunResult(await runInBrowser({ code, functionName: problem.functionName, tests: problem.sampleTests, timeLimitMs: problem.timeLimitMs }))
    setBusy('')
  }

  async function poll(submissionId, tries = 0) {
    try {
      const response = await api.get(`/api/contests/${contestId}/submissions/${submissionId}`)
      if (response.data.status === 'done') {
        setSubmitResult(response.data)
        setBusy('')
        onSubmitted()
        return
      }
    } catch {
      // keep trying
    }
    if (tries > 90) {
      setBusy('')
      setMessage({ ok: false, text: 'Still judging. The board will update when it finishes.' })
      return
    }
    polling.current = setTimeout(() => poll(submissionId, tries + 1), 1000)
  }

  async function submit() {
    setBusy('submit')
    setMessage(null)
    setSubmitResult(null)
    try {
      const response = await api.post(`/api/contests/${contestId}/problems/${problem.index}/submit`, { code })
      onSubmitted()
      poll(response.data.id)
    } catch (requestError) {
      setBusy('')
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not submit.') })
    }
  }

  async function open(submissionId) {
    const response = await api.get(`/api/contests/${contestId}/submissions/${submissionId}`).catch(() => null)
    if (response) setSubmitResult(response.data)
  }

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 300px', minWidth: 0 }}>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1.3rem' }}>{problem.label}. {problem.title}</h2>
        <p style={{ color: colors.muted, fontWeight: 600, margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          write <code style={{ fontFamily: MONO }}>{problem.functionName}(…)</code> · {problem.timeLimitMs} ms per test · {problem.sampleTests.length} sample + {problem.hiddenTestCount} hidden tests
        </p>
        <div style={{ ...cardStyle, whiteSpace: 'pre-wrap' }}>{promptBody(problem)}</div>
        <h3 style={sectionTitleStyle}>Examples</h3>
        {problem.sampleTests.map((test, i) => (
          <div key={i} style={{ ...cardStyle, fontFamily: MONO, fontSize: '0.85rem', marginTop: '0.5rem', padding: '0.6rem 0.9rem' }}>
            {problem.functionName}({test.input.map(json).join(', ')}) → {json(test.expected)}
          </div>
        ))}
        {submissions.length > 0 && (
          <>
            <h3 style={sectionTitleStyle}>Your submissions</h3>
            <div style={tableWrapStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td style={cellStyle}>{new Date(s.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: verdictColor(s.verdict) }}>{s.status === 'queued' ? 'Judging…' : s.verdict}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}><button onClick={() => open(s.id)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section style={{ flex: '2 1 420px', minWidth: 0 }}>
        <Suspense fallback={<div style={{ ...cardStyle, color: colors.muted }}>Loading editor…</div>}>
          <CodeEditor value={code} onChange={change} />
        </Suspense>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={run} disabled={Boolean(busy)} style={ghostButtonStyle}>{busy === 'run' ? 'Running…' : '▶ Run samples'}</button>
          {canSubmit && <button onClick={submit} disabled={Boolean(busy)} style={buttonStyle}>{busy === 'submit' ? 'Judging…' : 'Submit'}</button>}
        </div>
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
        <ResultPanel title="Run" result={runResult} />
        <ResultPanel title="Submission" result={submitResult} />
      </section>
    </div>
  )
}

export default function ContestPage() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const [contest, setContest] = useState(null)
  const [board, setBoard] = useState(null)
  const [tab, setTab] = useState('board')
  const [message, setMessage] = useState(null)
  const [now, setNow] = useState(Date.now())
  const offset = useRef(0) // server clock minus this browser's clock
  const refetchTimer = useRef(null)
  const isStaff = me && me.user.role !== 'student'

  const load = useCallback(() => api.get(`/api/contests/${id}`).then((response) => {
    offset.current = new Date(response.data.serverNow).getTime() - Date.now()
    setContest(response.data)
    return response.data
  }), [id])
  const loadBoard = useCallback(() => api.get(`/api/contests/${id}/standings`).then((response) => setBoard(response.data)).catch(() => {}), [id])

  useEffect(() => {
    load()
      .then((data) => {
        if (data.status !== 'draft') loadBoard()
        if (me?.user.role === 'student' && data.problems.length && ['running', 'frozen'].includes(data.status)) setTab(0)
      })
      .catch((requestError) => setMessage(errorMessage(requestError, 'Could not load this contest.')))
  }, [load, loadBoard, me])

  // Live: the server pings the room when a submission is queued or judged; refetch (batched).
  useEffect(() => {
    if (!me) return undefined
    const socket = connectSocket()
    socket.on('connect', () => emitAck(socket, 'contest:watch', { contestId: id }))
    socket.on('contest:updated', () => {
      clearTimeout(refetchTimer.current)
      refetchTimer.current = setTimeout(() => {
        loadBoard()
        if (me.user.role === 'student') load()
      }, 400)
    })
    return () => {
      clearTimeout(refetchTimer.current)
      socket.disconnect()
    }
  }, [me, id, load, loadBoard])

  // A ticking clock (server time) and a reload whenever the contest starts, freezes or ends.
  const status = contest?.status
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000)
    return () => clearInterval(timer)
  }, [])
  const nextChange = contest && [contest.startsAt, contest.freezesAt, contest.endsAt].filter(Boolean).map((d) => new Date(d).getTime()).find((t) => t > new Date(contest.serverNow).getTime())
  useEffect(() => {
    if (!nextChange || now < nextChange) return
    load().then((data) => {
      loadBoard()
      if (me?.user.role === 'student' && typeof tab !== 'number' && data.problems.length && ['running', 'frozen'].includes(data.status)) setTab(0)
    }).catch(() => {})
  }, [now, nextChange, load, loadBoard, tab, me])

  async function remove() {
    if (!window.confirm(`Delete "${contest.title}" and all its submissions?`)) return
    await api.delete(`/api/contests/${id}`)
    navigate(`/classes/${contest.classId}`)
  }

  if (!me) return null
  if (!contest) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(false)}>{message}</p>}
      </div>
    )
  }

  const look = CONTEST_STATUS[status]
  const live = status === 'running' || status === 'frozen'
  const clock = status === 'upcoming' ? `Starts in ${countdown(new Date(contest.startsAt) - now)}`
    : live ? `${countdown(new Date(contest.endsAt) - now)} left`
      : status === 'ended' ? 'Finished' : 'Not scheduled'
  const notStarted = status === 'draft' || status === 'upcoming'
  const tabStyle = (active) => ({ ...(active ? buttonStyle : ghostButtonStyle), padding: '0.4rem 0.9rem' })

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/classes/${contest.classId}`} style={linkStyle}>← Back to class</Link></p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>🏁 {contest.title}</h1>
        <span style={{ color: colors[look.color], fontWeight: 800 }}>{look.text}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 800, fontSize: '1.2rem' }} aria-live="off">{clock}</span>
      </div>
      <p style={{ color: colors.muted, fontWeight: 600, margin: '0.3rem 0 0' }}>
        {contest.problemCount} problem{contest.problemCount === 1 ? '' : 's'} · {contest.durationMinutes} min · {contest.penaltyMinutes} min penalty per wrong try
        {contest.freezeMinutes ? ` · board freezes for the last ${contest.freezeMinutes} min` : ''}
      </p>

      {isStaff && notStarted && (
        <ContestSettings key={`${contest.published}-${contest.startsAt}`} contest={contest} onSaved={(data) => { setContest(data); if (data.status !== 'draft') loadBoard() }} onDelete={remove} />
      )}

      {!isStaff && status === 'upcoming' && (
        <section style={{ ...cardStyle, marginTop: '1rem', textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', fontFamily: MONO, fontWeight: 800 }}>{countdown(new Date(contest.startsAt) - now)}</div>
          <p style={{ color: colors.muted, margin: '0.5rem 0 0' }}>The problems appear here when the contest starts. Stay on this page.</p>
        </section>
      )}

      {!notStarted && (
        <nav aria-label="Contest sections" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {(contest.problems || []).map((p) => (
            <button key={p.index} onClick={() => setTab(p.index)} style={tabStyle(tab === p.index)} title={p.title}>{p.label}</button>
          ))}
          <button onClick={() => { setTab('board'); loadBoard() }} style={tabStyle(tab === 'board')}>🏆 Leaderboard</button>
        </nav>
      )}

      {typeof tab === 'number' && contest.problems[tab] && (
        isStaff ? (
          <section style={{ marginTop: '1rem' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem' }}>{contest.problems[tab].label}. {contest.problems[tab].title}</h2>
            <div style={{ ...cardStyle, whiteSpace: 'pre-wrap' }}>{promptBody(contest.problems[tab])}</div>
            <h3 style={sectionTitleStyle}>Hidden tests (staff only)</h3>
            {contest.problems[tab].hiddenTests.map((test, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: '0.8rem', color: colors.muted }}>{contest.problems[tab].functionName}({test.input.map(json).join(', ')}) → {json(test.expected)}</div>
            ))}
          </section>
        ) : (
          <ProblemWorkspace
            key={tab}
            contestId={id}
            problem={contest.problems[tab]}
            canSubmit={live}
            lastCode={contest.lastCode?.[tab]}
            submissions={(contest.submissions || []).filter((s) => s.problemIndex === tab)}
            onSubmitted={() => { load(); loadBoard() }}
          />
        )
      )}

      {(tab === 'board' || notStarted) && board && status !== 'draft' && (
        <section style={{ marginTop: '1rem' }}>
          <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>Leaderboard {isStaff && status === 'frozen' && <span style={{ color: colors.muted, fontWeight: 600, fontSize: '0.85rem' }}>(live: students see it frozen)</span>}</h3>
          <Scoreboard board={board} />
        </section>
      )}
    </div>
  )
}
