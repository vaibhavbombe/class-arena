import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import AttemptReview from '../components/AttemptReview.jsx'
import { TYPE_LABELS } from '../components/QuestionEditor.jsx'
import { downloadCsv } from '../csv.js'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { cellStyle, colors, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle, widePageStyle } from '../styles.js'
import { StatusBadge, formatWhen, windowText } from '../testFormat.jsx'

const STATUS_TEXT = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted' }

function Stat({ label, value }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.6rem 0.9rem', minWidth: '7rem' }}>
      <div style={{ fontSize: '0.75rem', color: colors.muted }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{value ?? '—'}</div>
    </div>
  )
}

function PercentBar({ percent }) {
  if (percent === null) return <span style={{ color: colors.muted }}>—</span>
  const color = percent < 40 ? colors.danger : percent < 70 ? colors.primary : colors.success
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div aria-hidden="true" style={{ width: '6rem', height: '0.5rem', background: colors.border, borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color }} />
      </div>
      <span>{percent}%</span>
    </div>
  )
}

export default function TestResults() {
  const { id } = useParams()
  const me = useMe()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null) // { studentId, review } | { studentId, error }
  const [message, setMessage] = useState(null)

  function load() {
    api.get(`/api/tests/${id}/results`)
      .then((response) => setData(response.data))
      .catch((requestError) => setMessage({ ok: false, text: errorMessage(requestError, 'Could not load results.') }))
  }

  useEffect(load, [id])

  async function openStudent(row) {
    if (selected?.studentId === row.studentId) return setSelected(null)
    try {
      const response = await api.get(`/api/tests/${id}/results/${row.studentId}`)
      setSelected({ studentId: row.studentId, name: row.name, review: response.data })
    } catch (requestError) {
      setSelected({ studentId: row.studentId, name: row.name, error: errorMessage(requestError, 'Could not load this attempt.') })
    }
  }

  async function setReleased(released) {
    const stillTaking = data.stats.inProgressCount
    const warning = released && stillTaking
      ? `${stillTaking} student${stillTaking > 1 ? 's are' : ' is'} still taking this test and could be sent the answers. Release anyway?`
      : released ? 'Show students their scores and the correct answers now?' : 'Hide results from students again? (They show automatically once the test closes.)'
    if (!window.confirm(warning)) return
    try {
      await api.post(`/api/tests/${id}/release`, { released })
      load()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not change result visibility.') })
    }
  }

  function exportCsv() {
    const header = ['Name', 'Email', 'Status', 'Score', 'Out of', 'Percent', 'Submitted at', 'Minutes taken', 'Auto-submitted']
    const rows = data.students.map((row) => [
      row.name,
      row.email,
      STATUS_TEXT[row.status],
      row.score,
      row.maxScore,
      row.score === null || !row.maxScore ? '' : Math.round((row.score / row.maxScore) * 1000) / 10,
      row.submittedAt ? new Date(row.submittedAt).toISOString() : '',
      row.minutesTaken,
      row.submittedBy === 'timeout' ? 'yes' : '',
    ])
    const safeTitle = data.test.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'test'
    downloadCsv(`${safeTitle}-results.csv`, [header, ...rows])
  }

  if (!me) return null
  if (!data) {
    return (
      <div style={widePageStyle}>
        <AppHeader me={me} />
        {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}
      </div>
    )
  }

  const { test, stats, students } = data
  const visibleNote = test.resultsVisible
    ? test.resultsReleasedAt ? `Students can see their results (released ${formatWhen(test.resultsReleasedAt)}).` : 'Students can see their results (the test has closed).'
    : test.closesAt ? `Students will see their results when the test closes (${formatWhen(test.closesAt)}), or when you release them.` : 'This test has no closing time, so students see results only when you release them.'

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/tests/${id}`} style={linkStyle}>← Back to test</Link></p>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Results: {test.title}</h2>
        <StatusBadge status={test.status} />
      </div>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>{test.questionCount} questions · {test.totalPoints} points · {windowText(test)}</p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: test.resultsVisible ? colors.success : colors.muted }}>{visibleNote}</span>
        {test.resultsReleasedAt
          ? <button onClick={() => setReleased(false)} style={ghostButtonStyle}>Hide results</button>
          : !test.resultsVisible && <button onClick={() => setReleased(true)} style={{ ...ghostButtonStyle, color: colors.success, borderColor: colors.success }}>Release results now</button>}
        <button onClick={exportCsv} style={ghostButtonStyle}>Export CSV</button>
      </div>
      {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Stat label="Submitted" value={`${stats.submittedCount}/${students.length}`} />
        <Stat label="Average" value={stats.average === null ? null : `${stats.average} (${stats.averagePercent}%)`} />
        <Stat label="Median" value={stats.median} />
        <Stat label="Highest" value={stats.highest} />
        <Stat label="Lowest" value={stats.lowest} />
      </div>
      {stats.inProgressCount > 0 && <p style={{ color: colors.muted, fontSize: '0.85rem' }}>{stats.inProgressCount} still in progress; statistics include submitted attempts only.</p>}

      <h3 style={sectionTitleStyle}>By question</h3>
      <div style={tableWrapStyle}>
        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>#</th>
              <th style={cellStyle}>Question</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Points</th>
              <th style={cellStyle}>Correct</th>
            </tr>
          </thead>
          <tbody>
            {stats.perQuestion.map((question) => (
              <tr key={question.index}>
                <td style={cellStyle}>{question.number}</td>
                <td style={{ ...cellStyle, maxWidth: '22rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={question.prompt}>{question.prompt}</td>
                <td style={{ ...cellStyle, color: colors.muted }}>{TYPE_LABELS[question.type]}</td>
                <td style={{ ...cellStyle, color: colors.muted }}>{question.points}</td>
                <td style={cellStyle}><PercentBar percent={question.percentCorrect} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={sectionTitleStyle}>Students</h3>
      {students.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No students in this class yet.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Student</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Score</th>
                <th style={cellStyle}>Submitted</th>
                <th style={cellStyle}>Time</th>
                <th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Answers</span></th>
              </tr>
            </thead>
            <tbody>
              {students.map((row) => (
                <tr key={row.studentId}>
                  <td style={cellStyle}>
                    {row.name}
                    <div style={{ color: colors.muted, fontSize: '0.75rem' }}>{row.email}{!row.enrolled ? ' · left the class' : ''}</div>
                  </td>
                  <td style={{ ...cellStyle, color: row.status === 'submitted' ? colors.success : colors.muted }}>
                    {STATUS_TEXT[row.status]}{row.submittedBy === 'timeout' ? ' (time ran out)' : ''}
                  </td>
                  <td style={cellStyle}>{row.score === null ? '—' : `${row.score}/${row.maxScore}`}</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{row.submittedAt ? formatWhen(row.submittedAt) : '—'}</td>
                  <td style={{ ...cellStyle, color: colors.muted }}>{row.minutesTaken === null ? '—' : `${row.minutesTaken} min`}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {row.status === 'submitted' && (
                      <button onClick={() => openStudent(row)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>
                        {selected?.studentId === row.studentId ? 'Hide answers' : 'View answers'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <section style={{ marginTop: '1.5rem' }}>
          <h3 style={sectionTitleStyle}>{selected.name}'s answers</h3>
          {selected.error ? <p role="alert" style={messageStyle(false)}>{selected.error}</p> : <AttemptReview review={selected.review} />}
        </section>
      )}
    </div>
  )
}
