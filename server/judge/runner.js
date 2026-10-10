const ivm = require('isolated-vm')
const { deepEqual } = require('./compare')

// Runs a student's JavaScript against test cases inside a V8 isolate.
// This module is only ever loaded by the judge worker process (judge/worker.js),
// never by the API server, so student code can't run in the main server process.
//
// The isolate has no Node APIs at all (no require, fs, network, process or timers):
// only plain JavaScript plus a capped console.log we provide. Each test gets a fresh
// context (no state leaks between tests); the isolate has a memory cap, each call a
// CPU time limit, and the isolate is thrown away after the submission.

const LIMITS = {
  maxCodeLength: 50000,
  maxTests: 50,
  maxOutputChars: 65536, // per test result
  maxLogChars: 4000, // captured console.log per test
  defaultTimeMs: 1000,
  maxTimeMs: 5000,
  defaultMemoryMb: 32,
  minMemoryMb: 16,
  maxMemoryMb: 128,
}

const VERDICTS = {
  accepted: 'Accepted',
  wrong: 'Wrong Answer',
  runtime: 'Runtime Error',
  timeout: 'Time Limit Exceeded',
  memory: 'Memory Limit Exceeded',
  compile: 'Compile Error',
  output: 'Output Too Large',
}

const clamp = (value, min, max, fallback) => (Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback)

// Errors come from inside the isolate as plain messages; keep them short and free of
// internal file paths.
function cleanError(err) {
  const message = String(err && err.message ? err.message : err)
  return message.split('\n')[0].slice(0, 300)
}

/**
 * @param job.code          student source (must define `functionName`)
 * @param job.functionName  e.g. "solve"
 * @param job.tests         [{ input: [arg1, arg2...], expected: <JSON> }]
 * @param job.timeLimitMs   per test (CPU), clamped to 1..5000
 * @param job.memoryMb      isolate heap cap, clamped to 16..128
 * @param job.revealAll     sample runs: include output and expected for every test
 */
async function runSubmission(job) {
  const tests = Array.isArray(job.tests) ? job.tests.slice(0, LIMITS.maxTests) : []
  const timeLimitMs = clamp(job.timeLimitMs, 1, LIMITS.maxTimeMs, LIMITS.defaultTimeMs)
  const memoryMb = clamp(job.memoryMb, LIMITS.minMemoryMb, LIMITS.maxMemoryMb, LIMITS.defaultMemoryMb)
  const fn = String(job.functionName || '')
  const result = (verdict, extra = {}) => ({ verdict, passed: 0, total: tests.length, tests: [], ...extra })

  if (!/^[A-Za-z_$][\w$]{0,63}$/.test(fn)) return result(VERDICTS.compile, { error: 'The question has an invalid function name' })
  if (typeof job.code !== 'string' || !job.code.trim()) return result(VERDICTS.compile, { error: 'Write some code first' })
  if (job.code.length > LIMITS.maxCodeLength) return result(VERDICTS.compile, { error: `Code is longer than ${LIMITS.maxCodeLength} characters` })

  const isolate = new ivm.Isolate({ memoryLimit: memoryMb })
  try {
    let script
    try {
      // Wrapped so the function is found no matter how it was declared (function, const, class).
      script = await isolate.compileScript(`${job.code}\n;globalThis.__studentFn = (typeof ${fn} === 'function') ? ${fn} : undefined;`)
    } catch (err) {
      return result(VERDICTS.compile, { error: cleanError(err) })
    }

    const outcomes = []
    let firstFailure = null
    for (let index = 0; index < tests.length; index++) {
      const test = tests[index]
      const context = await isolate.createContext()
      const logs = []
      let logChars = 0
      // console.log inside the isolate calls back into the worker, which only stores text.
      await context.global.set('__log', new ivm.Callback((line) => {
        if (logChars >= LIMITS.maxLogChars) return
        const text = String(line).slice(0, LIMITS.maxLogChars - logChars)
        logChars += text.length
        logs.push(text)
      }))
      await context.eval(`globalThis.console = { log: (...a) => __log(a.map((v) => { try { return typeof v === 'string' ? v : JSON.stringify(v) } catch { return String(v) } }).join(' ')) }; globalThis.console.error = globalThis.console.warn = globalThis.console.info = globalThis.console.log;`)

      const started = process.hrtime.bigint()
      let outcome
      try {
        // Top-level code runs per test too, under the same time limit.
        await script.run(context, { timeout: timeLimitMs })
        const json = await context.evalClosure(
          `if (typeof __studentFn !== 'function') throw new Error('Define a function named ${fn}')
           const value = __studentFn(...JSON.parse($0))
           if (value && typeof value.then === 'function') throw new Error('Return a value, not a Promise')
           const out = JSON.stringify(value)
           return out === undefined ? 'null' : out`,
          [JSON.stringify(test.input ?? [])],
          { timeout: timeLimitMs, result: { copy: true } },
        )
        const timeMs = Number(process.hrtime.bigint() - started) / 1e6
        if (json.length > LIMITS.maxOutputChars) {
          outcome = { verdict: VERDICTS.output, timeMs }
        } else {
          const output = JSON.parse(json)
          outcome = { verdict: deepEqual(output, test.expected) ? VERDICTS.accepted : VERDICTS.wrong, timeMs, output }
        }
      } catch (err) {
        const timeMs = Number(process.hrtime.bigint() - started) / 1e6
        if (isolate.isDisposed) outcome = { verdict: VERDICTS.memory, timeMs }
        else if (/timed out/i.test(err.message)) outcome = { verdict: VERDICTS.timeout, timeMs }
        else outcome = { verdict: VERDICTS.runtime, timeMs, error: cleanError(err) }
      } finally {
        if (!isolate.isDisposed) context.release()
      }

      outcome.index = index
      outcome.passed = outcome.verdict === VERDICTS.accepted
      outcome.timeMs = Math.round(outcome.timeMs * 100) / 100
      if (job.revealAll) {
        outcome.input = test.input
        outcome.expected = test.expected
        outcome.logs = logs
      } else {
        // Hidden tests: only pass/fail, verdict and time. Never the input, expected or output.
        delete outcome.output
        delete outcome.error
      }
      outcomes.push(outcome)
      if (!outcome.passed && !firstFailure) firstFailure = outcome
      // A dead isolate can't run more tests.
      if (isolate.isDisposed) break
    }

    const passed = outcomes.filter((outcome) => outcome.passed).length
    const verdict = passed === tests.length && tests.length > 0 ? VERDICTS.accepted : (firstFailure?.verdict || VERDICTS.wrong)
    return {
      verdict,
      passed,
      total: tests.length,
      timeMs: Math.round(outcomes.reduce((sum, outcome) => sum + outcome.timeMs, 0) * 100) / 100,
      tests: outcomes,
    }
  } finally {
    if (!isolate.isDisposed) isolate.dispose()
  }
}

module.exports = { runSubmission, LIMITS, VERDICTS }
