const test = require('node:test')
const assert = require('node:assert/strict')
const { runSubmission, VERDICTS } = require('../judge/runner')
const { deepEqual } = require('../judge/compare')

const sumTests = [
  { input: [1, 2], expected: 3 },
  { input: [-5, 5], expected: 0 },
  { input: [100, 23], expected: 123 },
]
const run = (code, extra = {}) => runSubmission({ code, functionName: 'solve', tests: sumTests, timeLimitMs: 300, memoryMb: 32, ...extra })

test('deepEqual: key order ignored, array order kept, float tolerance', () => {
  assert.equal(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true)
  assert.equal(deepEqual([1, 2], [2, 1]), false)
  assert.equal(deepEqual(0.1 + 0.2, 0.3), true)
  assert.equal(deepEqual(1, '1'), false)
  assert.equal(deepEqual(null, {}), false)
  assert.equal(deepEqual({ a: undefined }, {}), false)
})

test('accepted: every test passes', async () => {
  const r = await run('function solve(a, b) { return a + b }')
  assert.equal(r.verdict, VERDICTS.accepted)
  assert.equal(r.passed, 3)
})

test('arrow functions and classes are found too', async () => {
  assert.equal((await run('const solve = (a, b) => a + b')).verdict, VERDICTS.accepted)
})

test('wrong answer reports how many passed', async () => {
  const r = await run('function solve(a, b) { return a + b + (a === 1 ? 1 : 0) }')
  assert.equal(r.verdict, VERDICTS.wrong)
  assert.equal(r.passed, 2)
  assert.equal(r.tests[0].passed, false)
})

test('hidden tests never reveal input, expected, output or error text', async () => {
  const r = await run('function solve(a, b) { throw new Error("input was " + a) }')
  assert.equal(r.verdict, VERDICTS.runtime)
  const json = JSON.stringify(r)
  for (const leaked of ['input', 'expected', 'output', 'input was']) assert.ok(!json.includes(leaked), `leaked ${leaked}`)
})

test('sample runs (revealAll) show input, expected, output and console.log', async () => {
  const r = await run('function solve(a, b) { console.log("adding", a, b, { x: 1 }); return a + b }', { revealAll: true })
  assert.equal(r.verdict, VERDICTS.accepted)
  assert.deepEqual(r.tests[0].input, [1, 2])
  assert.equal(r.tests[0].output, 3)
  assert.deepEqual(r.tests[0].logs, ['adding 1 2 {"x":1}'])
})

test('runtime errors are reported with a short message', async () => {
  const r = await run('function solve(a, b) { return a.nope.deeper }', { revealAll: true })
  assert.equal(r.verdict, VERDICTS.runtime)
  assert.match(r.tests[0].error, /Cannot read properties of undefined/)
})

test('compile errors are caught before running', async () => {
  const r = await run('function solve(a, b) { return a + }')
  assert.equal(r.verdict, VERDICTS.compile)
  assert.ok(r.error)
})

test('a missing function is a runtime error with a clear message', async () => {
  const r = await run('function add(a, b) { return a + b }', { revealAll: true })
  assert.equal(r.verdict, VERDICTS.runtime)
  assert.match(r.tests[0].error, /Define a function named solve/)
})

test('infinite loops hit the time limit (inside the function and at top level)', async () => {
  const started = Date.now()
  assert.equal((await run('function solve() { while (true) {} }')).verdict, VERDICTS.timeout)
  assert.equal((await run('while (true) {}\nfunction solve(a, b) { return a + b }')).verdict, VERDICTS.timeout)
  assert.ok(Date.now() - started < 5000, 'time limits were enforced quickly')
})

test('memory bombs hit the memory limit and stop the run', async () => {
  const r = await run('function solve() { const a = []; while (true) a.push(new Array(1e6).fill(1)) }', { timeLimitMs: 5000 })
  assert.equal(r.verdict, VERDICTS.memory)
  assert.equal(r.tests.length, 1) // the isolate is gone, so no further tests ran
})

test('no Node APIs are reachable from student code', async () => {
  const probe = `function solve() {
    const seen = {
      require: typeof require, process: typeof process, module: typeof module, setTimeout: typeof setTimeout,
      fetch: typeof fetch, viaConstructor: typeof (function () { return this })().process,
      fnConstructor: Function('return typeof process')(),
    }
    let escaped = 'no'
    try { escaped = typeof this.constructor.constructor('return process')() } catch (e) { escaped = 'threw' }
    seen.escaped = escaped
    return seen
  }`
  const r = await runSubmission({ code: probe, functionName: 'solve', tests: [{ input: [], expected: null }], revealAll: true })
  const seen = r.tests[0].output
  for (const [name, type] of Object.entries(seen)) {
    assert.ok(['undefined', 'threw'].includes(type), `${name} is reachable: ${type}`)
  }
  assert.equal(seen.require, 'undefined')
  assert.equal(seen.process, 'undefined')
  assert.equal(seen.fnConstructor, 'undefined')
})

test('each test gets a fresh context (global state does not leak between tests)', async () => {
  const r = await run('let calls = 0; function solve(a, b) { calls++; return calls === 1 ? a + b : -1 }')
  assert.equal(r.verdict, VERDICTS.accepted)
})

test('returning a Promise is rejected', async () => {
  const r = await run('async function solve(a, b) { return a + b }', { revealAll: true })
  assert.equal(r.verdict, VERDICTS.runtime)
  assert.match(r.tests[0].error, /not a Promise/)
})

test('huge outputs are refused', async () => {
  const r = await run('function solve() { return "x".repeat(200000) }')
  assert.equal(r.verdict, VERDICTS.output)
})

test('console.log output is capped', async () => {
  const r = await run('function solve(a, b) { for (let i = 0; i < 10000; i++) console.log("spam spam spam"); return a + b }', { revealAll: true })
  assert.ok(r.tests[0].logs.join('').length <= 4000)
})

test('limits are clamped (no 10-minute time limits or 2 GB isolates)', async () => {
  const started = Date.now()
  const r = await run('function solve() { while (true) {} }', { timeLimitMs: 600000, memoryMb: 2048, tests: [{ input: [], expected: 1 }] })
  assert.equal(r.verdict, VERDICTS.timeout)
  assert.ok(Date.now() - started < 7000)
})

test('invalid function names in the question are refused', async () => {
  const r = await run('function solve() {}', { functionName: 'solve; process.exit()' })
  assert.equal(r.verdict, VERDICTS.compile)
})
