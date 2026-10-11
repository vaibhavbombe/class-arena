import { cardStyle, colors } from '../styles.js'

// Judge results and prompts, shared by practice problems and contests.
export const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"
const json = (value) => JSON.stringify(value)

// The prompt without its first line when that line is the title (already shown above it).
export function promptBody(problem) {
  const lines = problem.prompt.split(/\r?\n/)
  if (lines[0].trim() !== problem.title) return problem.prompt
  return lines.slice(1).join('\n').trim() || problem.prompt
}

const VERDICT_LOOK = {
  Accepted: { color: 'success', icon: '✓' },
  'Wrong Answer': { color: 'danger', icon: '✗' },
}
export const verdictColor = (verdict) => (verdict === 'Accepted' ? colors.success : verdict ? colors.danger : colors.muted)

export function ResultPanel({ title, result }) {
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
