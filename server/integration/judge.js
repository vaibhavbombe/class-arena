// The code judge end to end: API-side queue -> Redis -> judge worker process -> result.
// Uses the worker started by the test server (same REDIS_PREFIX).
const { call, check, finish } = require('./helpers')
const { judgeCode } = require('../judge/queue')
const { getRedis } = require('../lib/redis')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sumJob = (code, extra = {}) => ({
  code,
  functionName: 'solve',
  tests: [{ input: [1, 2], expected: 3 }, { input: [10, -4], expected: 6 }],
  timeLimitMs: 500,
  memoryMb: 32,
  ...extra,
})

;(async () => {
  let health
  for (let i = 0; i < 20; i++) {
    health = await call('GET', '/api/health')
    if (health.d.judge === 'ok') break
    await sleep(500)
  }
  check('health shows a live judge worker', health.d.judge === 'ok', health.d)

  const ok = await judgeCode(sumJob('function solve(a, b) { return a + b }'))
  check('a correct submission is Accepted via the queue and worker', ok.verdict === 'Accepted' && ok.passed === 2, ok)

  const hidden = await judgeCode(sumJob('function solve(a, b) { return a - b }'))
  check('hidden-test results reveal no inputs or outputs', hidden.verdict === 'Wrong Answer' && !/input|expected|output/.test(JSON.stringify(hidden)), hidden)

  const started = Date.now()
  const loop = await judgeCode(sumJob('function solve() { while (true) {} }'))
  check('an infinite loop gets Time Limit Exceeded quickly', loop.verdict === 'Time Limit Exceeded' && Date.now() - started < 8000, { loop, ms: Date.now() - started })

  const bomb = await judgeCode(sumJob('function solve() { const a = []; while (true) a.push(new Array(1e6).fill(1)) }', { timeLimitMs: 5000 }))
  check('a memory bomb gets Memory Limit Exceeded', bomb.verdict === 'Memory Limit Exceeded', bomb)
  const after = await judgeCode(sumJob('const solve = (a, b) => a + b'))
  check('the worker keeps working after a memory bomb', after.verdict === 'Accepted', after)

  // Six submissions at once: all answered, each with its own result.
  const many = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => judgeCode({ ...sumJob(`function solve(a, b) { return a + b + ${n % 2} }`), tests: [{ input: [1, 1], expected: 2 }] })))
  check('six simultaneous submissions each get their own verdict', many.every((r, i) => r.verdict === ((i + 1) % 2 === 0 ? 'Accepted' : 'Wrong Answer')), many.map((r) => r.verdict))

  const queueLength = await getRedis().llen('judge:queue')
  check('the queue is empty afterwards', queueLength === 0, queueLength)

  await finish()
  getRedis().disconnect()
  process.exit(process.exitCode || 0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
