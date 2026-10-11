// Runs a student's code against the SAMPLE tests in the browser, off the main thread.
// This is only a convenience ("Run"): it runs the student's own code in their own browser.
// Grading ("Submit") happens on the server judge with hidden tests. If the code loops
// forever, the page terminates this worker (see runInBrowser.js).

function deepEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b)
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  }
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

const MAX_LOG_CHARS = 4000

self.onmessage = ({ data }) => {
  const { code, functionName, tests } = data
  for (let index = 0; index < tests.length; index++) {
    const logs = []
    let logChars = 0
    const log = (...args) => {
      if (logChars >= MAX_LOG_CHARS) return
      const line = args.map((v) => { try { return typeof v === 'string' ? v : JSON.stringify(v) } catch { return String(v) } }).join(' ').slice(0, MAX_LOG_CHARS - logChars)
      logChars += line.length
      logs.push(line)
    }
    const fakeConsole = { log, error: log, warn: log, info: log }
    self.postMessage({ type: 'start', index })
    const started = performance.now()
    let result
    try {
      // A fresh function per test, like the server judge (no state carried between tests).
      const make = new Function('console', `${code}\n;return (typeof ${functionName} === 'function') ? ${functionName} : undefined;`)
      const fn = make(fakeConsole)
      if (typeof fn !== 'function') throw new Error(`Define a function named ${functionName}`)
      // Deep copy of the input, so the student's code can't change the test data we show.
      const value = fn(...JSON.parse(JSON.stringify(tests[index].input)))
      if (value && typeof value.then === 'function') throw new Error('Return a value, not a Promise')
      const json = JSON.stringify(value)
      const output = json === undefined ? null : JSON.parse(json)
      result = { verdict: deepEqual(output, tests[index].expected) ? 'Accepted' : 'Wrong Answer', output }
    } catch (err) {
      result = { verdict: err instanceof SyntaxError ? 'Compile Error' : 'Runtime Error', error: String(err && err.message ? err.message : err).split('\n')[0].slice(0, 300) }
    }
    self.postMessage({
      type: 'done',
      index,
      result: { ...result, index, passed: result.verdict === 'Accepted', timeMs: Math.round((performance.now() - started) * 100) / 100, logs, input: tests[index].input, expected: tests[index].expected },
    })
  }
  self.postMessage({ type: 'finished' })
}
