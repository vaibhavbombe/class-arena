import { useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { FONT, colors, ghostButtonStyle, inputStyle, messageStyle, tableWrapStyle, cellStyle } from '../styles.js'

// Settings for a coding question: function name, starter code, reference solution,
// sample and hidden tests (edited as JSON text), limits, and "Check with judge".

const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"
const codeBox = { ...inputStyle, fontFamily: MONO, fontSize: '0.85rem', resize: 'vertical', whiteSpace: 'pre', tabSize: 2 }
const labelStyle = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: colors.muted }
const smallButton = { ...ghostButtonStyle, padding: '0.3rem 0.6rem' }
const TIME_CHOICES = [250, 500, 1000, 2000, 5000]
const MEMORY_CHOICES = [16, 32, 64, 128]

const toText = (value) => JSON.stringify(value)
const emptyTest = () => ({ input: '', expected: '' })

export function toCodeForm(code) {
  if (!code) {
    return {
      functionName: 'solve',
      starterCode: 'function solve(a, b) {\n  \n}\n',
      referenceSolution: '',
      sampleTests: [emptyTest()],
      hiddenTests: [emptyTest()],
      timeLimitMs: 1000,
      memoryMb: 32,
    }
  }
  return {
    functionName: code.functionName,
    starterCode: code.starterCode || '',
    referenceSolution: code.referenceSolution || '',
    sampleTests: code.sampleTests.map((t) => ({ input: toText(t.input), expected: toText(t.expected) })),
    hiddenTests: code.hiddenTests.map((t) => ({ input: toText(t.input), expected: toText(t.expected) })),
    timeLimitMs: code.timeLimitMs,
    memoryMb: code.memoryMb,
  }
}

// Text fields -> JSON for the API, with a message naming the exact row on a typo.
export function codeFormToBody(form) {
  const parseTests = (rows, kind) => {
    const tests = []
    for (const [i, row] of rows.entries()) {
      const label = `${kind} test ${i + 1}`
      let input
      let expected
      try {
        input = JSON.parse(row.input)
      } catch {
        return { error: `${label}: the input isn't valid JSON. Write the arguments as a list, e.g. [2, 3]` }
      }
      if (!Array.isArray(input)) return { error: `${label}: the input must be a list of arguments, e.g. [2, 3]` }
      try {
        expected = JSON.parse(row.expected)
      } catch {
        return { error: `${label}: the expected value isn't valid JSON (text needs "quotes")` }
      }
      tests.push({ input, expected })
    }
    return { tests }
  }
  const samples = parseTests(form.sampleTests, 'Sample')
  if (samples.error) return samples
  const hidden = parseTests(form.hiddenTests, 'Hidden')
  if (hidden.error) return hidden
  return {
    code: {
      functionName: form.functionName.trim(),
      starterCode: form.starterCode,
      referenceSolution: form.referenceSolution,
      sampleTests: samples.tests,
      hiddenTests: hidden.tests,
      timeLimitMs: Number(form.timeLimitMs),
      memoryMb: Number(form.memoryMb),
    },
  }
}

function TestRows({ title, hint, rows, onChange, max }) {
  const update = (index, field, value) => onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <legend style={{ ...labelStyle, marginBottom: '0.3rem' }}>
        <strong style={{ color: colors.text }}>{title}</strong> {hint}
      </legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: colors.muted, width: '1.4rem' }}>{i + 1}.</span>
          <input value={row.input} onChange={(event) => update(i, 'input', event.target.value)} placeholder="Arguments, e.g. [2, 3]" aria-label={`${title} ${i + 1} input`} required style={{ ...codeBox, flex: '2 1 180px', minWidth: 0, whiteSpace: 'nowrap' }} />
          <span aria-hidden="true" style={{ color: colors.muted }}>→</span>
          <input value={row.expected} onChange={(event) => update(i, 'expected', event.target.value)} placeholder='Expected, e.g. 5 or "text"' aria-label={`${title} ${i + 1} expected`} required style={{ ...codeBox, flex: '1 1 140px', minWidth: 0, whiteSpace: 'nowrap' }} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1} style={smallButton} aria-label={`Remove ${title.toLowerCase()} ${i + 1}`}>✕</button>
        </div>
      ))}
      {rows.length < max && <button type="button" onClick={() => onChange([...rows, emptyTest()])} style={{ ...smallButton, alignSelf: 'flex-start' }}>+ Add test</button>}
    </fieldset>
  )
}

function CheckResults({ result }) {
  // The judge numbers tests across samples and hidden ones; label each kind from 1.
  const sampleCount = (result.tests || []).filter((test) => test.kind === 'sample').length
  const number = (test) => (test.kind === 'sample' ? test.index + 1 : test.index - sampleCount + 1)
  return (
    <div style={{ ...tableWrapStyle, marginTop: '0.5rem' }}>
      <p style={{ ...messageStyle(result.verdict === 'Accepted'), margin: '0.5rem 0' }}>
        {result.verdict === 'Accepted' ? '✓' : '✗'} {result.verdict}: {result.passed} of {result.total} tests passed{result.error ? ` (${result.error})` : ''}
      </p>
      {result.tests?.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead><tr><th style={cellStyle}>Test</th><th style={cellStyle}>Input</th><th style={cellStyle}>Expected</th><th style={cellStyle}>Got</th><th style={cellStyle}>Time</th></tr></thead>
          <tbody>
            {result.tests.map((test) => (
              <tr key={test.index}>
                <td style={{ ...cellStyle, fontWeight: 700, color: test.passed ? colors.success : colors.danger, whiteSpace: 'nowrap' }}>{test.passed ? '✓' : '✗'} {test.kind} {number(test)}</td>
                <td style={{ ...cellStyle, fontFamily: MONO }}>{toText(test.input)}</td>
                <td style={{ ...cellStyle, fontFamily: MONO }}>{toText(test.expected)}</td>
                <td style={{ ...cellStyle, fontFamily: MONO, color: test.passed ? colors.text : colors.danger }}>{test.error ? test.error : test.verdict === 'Accepted' || test.verdict === 'Wrong Answer' ? toText(test.output) : test.verdict}</td>
                <td style={{ ...cellStyle, color: colors.muted }}>{test.timeMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function CodeSettingsEditor({ value, onChange }) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)
  const [checkError, setCheckError] = useState('')
  const set = (field, fieldValue) => onChange({ ...value, [field]: fieldValue })

  async function check() {
    setResult(null)
    setCheckError('')
    const { code, error } = codeFormToBody(value)
    if (error) return setCheckError(error)
    if (!value.referenceSolution.trim()) return setCheckError('Write a reference solution first; the judge runs it against every test.')
    setChecking(true)
    try {
      const response = await api.post('/api/questions/check-code', { code, solution: value.referenceSolution })
      setResult(response.data)
    } catch (requestError) {
      setCheckError(errorMessage(requestError, 'The judge could not check this.'))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={labelStyle}>
          Function students write
          <input value={value.functionName} onChange={(event) => set('functionName', event.target.value)} required maxLength={64} style={{ ...codeBox, width: '10rem' }} />
        </label>
        <label style={labelStyle}>
          Time limit per test
          <select value={value.timeLimitMs} onChange={(event) => set('timeLimitMs', Number(event.target.value))} style={inputStyle}>
            {TIME_CHOICES.map((ms) => <option key={ms} value={ms}>{ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Memory limit
          <select value={value.memoryMb} onChange={(event) => set('memoryMb', Number(event.target.value))} style={inputStyle}>
            {MEMORY_CHOICES.map((mb) => <option key={mb} value={mb}>{mb} MB</option>)}
          </select>
        </label>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: colors.muted }}>
        JavaScript. Each test calls <code style={{ fontFamily: MONO }}>{value.functionName || 'solve'}(...input)</code> and compares the returned value with the expected one (as JSON; key order in objects doesn't matter).
      </p>

      <label style={labelStyle}>
        Starter code (what students see first)
        <textarea value={value.starterCode} onChange={(event) => set('starterCode', event.target.value)} rows={5} spellCheck={false} style={codeBox} />
      </label>

      <TestRows title="Sample tests" hint="students can see and run these" rows={value.sampleTests} onChange={(rows) => set('sampleTests', rows)} max={10} />
      <TestRows title="Hidden tests" hint="used for grading, never shown to students" rows={value.hiddenTests} onChange={(rows) => set('hiddenTests', rows)} max={50} />

      <label style={labelStyle}>
        Reference solution (staff only, optional)
        <textarea value={value.referenceSolution} onChange={(event) => set('referenceSolution', event.target.value)} rows={5} spellCheck={false} placeholder={`function ${value.functionName || 'solve'}(a, b) {\n  return a + b\n}`} style={codeBox} />
      </label>
      <div>
        <button type="button" onClick={check} disabled={checking} style={{ ...ghostButtonStyle, fontFamily: FONT }}>{checking ? 'Checking…' : '▶ Check with judge'}</button>
        <span style={{ fontSize: '0.8rem', color: colors.muted, marginLeft: '0.6rem' }}>Runs the reference solution against every test, to catch a wrong expected value before students do.</span>
      </div>
      {checkError && <p role="alert" style={messageStyle(false)}>{checkError}</p>}
      {result && <CheckResults result={result} />}
    </div>
  )
}
