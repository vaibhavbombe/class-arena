// "Run": executes the sample tests in a Web Worker. Each test must finish within the
// problem's time limit (plus a little slack for the browser); otherwise the worker is
// terminated, that test is marked Time Limit Exceeded and the rest are skipped.
const SLACK_MS = 300

export function runInBrowser({ code, functionName, tests, timeLimitMs }) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runner.worker.js', import.meta.url))
    const results = []
    let timer = null

    function finish(extra = {}) {
      clearTimeout(timer)
      worker.terminate()
      const passed = results.filter((r) => r.passed).length
      const firstFail = results.find((r) => !r.passed)
      resolve({ verdict: passed === tests.length ? 'Accepted' : firstFail?.verdict || 'Wrong Answer', passed, total: tests.length, tests: results, ...extra })
    }

    worker.onmessage = ({ data }) => {
      if (data.type === 'start') {
        clearTimeout(timer)
        timer = setTimeout(() => {
          results.push({ index: data.index, passed: false, verdict: 'Time Limit Exceeded', timeMs: timeLimitMs, input: tests[data.index].input, expected: tests[data.index].expected, logs: [] })
          finish()
        }, timeLimitMs + SLACK_MS)
      } else if (data.type === 'done') {
        clearTimeout(timer)
        results.push(data.result)
      } else if (data.type === 'finished') {
        finish()
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish({ verdict: 'Runtime Error', error: event.message })
    }
    worker.postMessage({ code, functionName, tests })
  })
}
