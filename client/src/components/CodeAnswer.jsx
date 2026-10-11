import { Suspense, lazy, useState } from 'react'
import { runInBrowser } from '../code/runInBrowser.js'
import { cardStyle, colors, ghostButtonStyle } from '../styles.js'

const CodeEditor = lazy(() => import('../code/CodeEditor.jsx'))
const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"
const json = (value) => JSON.stringify(value)

// A coding question inside a timed test: the student's code is the answer (autosaved like
// any other answer). "Run samples" checks the visible examples in the browser; grading
// uses the hidden tests on the server after the test is submitted.
export default function CodeAnswer({ question, value, onChange }) {
  const { functionName, starterCode, sampleTests, hiddenTestCount, timeLimitMs } = question.code
  const code = value || starterCode
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    setResult(await runInBrowser({ code, functionName, tests: sampleTests, timeLimitMs }))
    setRunning(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ fontFamily: MONO, fontSize: '0.85rem', color: colors.muted }}>
        {sampleTests.map((test, i) => <div key={i}>{functionName}({test.input.map(json).join(', ')}) → {json(test.expected)}</div>)}
      </div>
      <Suspense fallback={<div style={{ ...cardStyle, color: colors.muted }}>Loading editor…</div>}>
        <CodeEditor value={code} onChange={onChange} height="300px" />
      </Suspense>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={run} disabled={running} style={ghostButtonStyle}>{running ? 'Running…' : '▶ Run samples'}</button>
        <span style={{ fontSize: '0.8rem', color: colors.muted }}>Graded after you submit, on {hiddenTestCount} hidden test{hiddenTestCount === 1 ? '' : 's'}: points for each one passed.</span>
      </div>
      {result && (
        <div style={{ fontSize: '0.85rem' }}>
          <strong style={{ color: result.verdict === 'Accepted' ? colors.success : colors.danger }}>
            {result.verdict === 'Accepted' ? '✓' : '✗'} Samples: {result.passed} of {result.total} passed
          </strong>
          {result.tests.filter((test) => !test.passed).slice(0, 2).map((test) => (
            <div key={test.index} style={{ fontFamily: MONO, marginTop: '0.25rem' }}>
              {functionName}({test.input.map(json).join(', ')}): {test.error ? <span style={{ color: colors.danger }}>{test.error}</span> : test.verdict === 'Time Limit Exceeded' ? <span style={{ color: colors.danger }}>too slow</span> : <>got {json(test.output)}, expected {json(test.expected)}</>}
            </div>
          ))}
          {result.tests.some((test) => test.logs?.length) && (
            <pre style={{ fontFamily: MONO, background: colors.bg, padding: '0.5rem', borderRadius: '6px', whiteSpace: 'pre-wrap', margin: '0.4rem 0 0' }}>{result.tests.flatMap((test) => test.logs || []).join('\n')}</pre>
          )}
        </div>
      )}
    </div>
  )
}
