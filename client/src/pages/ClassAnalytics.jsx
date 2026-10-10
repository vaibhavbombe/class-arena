import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { StatTile, TopicBars, TrendColumns } from '../components/charts.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { cellStyle, colors, ghostButtonStyle, linkStyle, messageStyle, sectionTitleStyle, tableWrapStyle, widePageStyle } from '../styles.js'

const SORTS = {
  attention: (a, b) => Number(b.needsAttention) - Number(a.needsAttention) || (a.averagePercent ?? -1) - (b.averagePercent ?? -1),
  name: (a, b) => a.name.localeCompare(b.name),
  average: (a, b) => (b.averagePercent ?? -1) - (a.averagePercent ?? -1),
  missed: (a, b) => b.testsMissed - a.testsMissed,
}
const pct = (value) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`)

export default function ClassAnalytics() {
  const { id } = useParams()
  const me = useMe()
  const [data, setData] = useState(null)
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  const [sort, setSort] = useState('attention')

  useEffect(() => {
    api.get(`/api/classes/${id}/analytics`)
      .then((response) => setData(response.data))
      .catch((requestError) => setError(errorMessage(requestError, 'Could not load analytics.')))
    api.get(`/api/classes/${id}`).then((response) => setClassName(response.data.name)).catch(() => {})
  }, [id])

  const students = useMemo(() => (data ? [...data.students].sort(SORTS[sort]) : []), [data, sort])

  if (!me) return null
  const { summary } = data || {}

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <p><Link to={`/classes/${id}`} style={linkStyle}>← Back to class</Link></p>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.6rem' }}>📊 {className || 'Class'} analytics</h1>
      <p style={{ color: colors.muted, fontWeight: 600, marginTop: 0 }}>Scores count submitted tests only. Updated each time you open this page.</p>
      {error && <p role="alert" style={messageStyle(false)}>{error}</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <StatTile label="Class average" value={pct(summary.classAveragePercent)} hint={`across ${summary.testsGiven} test${summary.testsGiven === 1 ? '' : 's'}`} />
            <StatTile label="Participation" value={pct(summary.participationPercent)} hint="of expected submissions" />
            <StatTile label="Students" value={summary.studentCount} hint={summary.needsAttentionCount ? `⚠ ${summary.needsAttentionCount} need attention` : 'none flagged'} />
            <StatTile label="Live games" value={summary.liveGamesPlayed} hint={summary.averageLivePlayers ? `${summary.averageLivePlayers} players on average` : 'none played yet'} />
          </div>

          <h2 style={sectionTitleStyle}>Class average by test</h2>
          {data.testTrend.length ? (
            <>
              <TrendColumns points={data.testTrend} studentCount={summary.studentCount} />
              <details style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: colors.link }}>View as table</summary>
                <div style={{ ...tableWrapStyle, marginTop: '0.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={cellStyle}>Test</th><th style={cellStyle}>Average</th><th style={cellStyle}>Submitted</th></tr></thead>
                    <tbody>
                      {data.testTrend.map((point) => (
                        <tr key={point.testId}>
                          <td style={cellStyle}><Link to={`/tests/${point.testId}/results`} style={linkStyle}>{point.title}</Link></td>
                          <td style={cellStyle}>{pct(point.averagePercent)}</td>
                          <td style={cellStyle}>{point.submitted} of {summary.studentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p style={{ color: colors.muted, fontSize: '0.9rem' }}>No tests have opened yet. Publish a test to start seeing trends.</p>
          )}

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <section style={{ flex: '1 1 320px', minWidth: 0 }}>
              <h2 style={sectionTitleStyle}>Topics, weakest first</h2>
              {data.topics.length ? <TopicBars topics={data.topics} /> : (
                <p style={{ color: colors.muted, fontSize: '0.9rem' }}>No tagged questions answered yet. Add tags to questions in the question bank to see topics.</p>
              )}
            </section>
            <section style={{ flex: '1 1 320px', minWidth: 0 }}>
              <h2 style={sectionTitleStyle}>Hardest questions</h2>
              {data.hardestQuestions.length ? (
                <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.hardestQuestions.map((question, i) => (
                    <li key={`${question.testTitle}-${i}`} style={{ fontSize: '0.9rem' }}>
                      <strong>{Math.round(question.percentCorrect)}% correct</strong>
                      <span style={{ color: colors.muted }}> · {question.testTitle} · {question.attempts} answers</span>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={question.prompt}>{question.prompt}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ color: colors.muted, fontSize: '0.9rem' }}>Nothing answered yet.</p>
              )}
            </section>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={sectionTitleStyle}>Students</h2>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.muted, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)} style={{ ...ghostButtonStyle, padding: '0.35rem 0.5rem' }}>
                <option value="attention">Needs attention first</option>
                <option value="average">Highest average</option>
                <option value="missed">Most missed</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          {students.length ? (
            <div style={tableWrapStyle}>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={cellStyle}>Student</th>
                    <th style={cellStyle}>Average</th>
                    <th style={cellStyle}>Last test</th>
                    <th style={cellStyle}>Taken</th>
                    <th style={cellStyle}>Missed</th>
                    <th style={cellStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => (
                    <tr key={row.studentId}>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>{row.name}</td>
                      <td style={cellStyle}>{pct(row.averagePercent)}</td>
                      <td style={cellStyle}>{pct(row.lastPercent)}</td>
                      <td style={cellStyle}>{row.testsTaken}</td>
                      <td style={cellStyle}>{row.testsMissed}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: row.needsAttention ? colors.danger : colors.success }}>
                        {row.needsAttention ? `⚠ ${row.reasons.join(', ')}` : '✓ On track'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: colors.muted, fontSize: '0.9rem' }}>No students in this class yet.</p>
          )}
        </>
      )}
    </div>
  )
}
