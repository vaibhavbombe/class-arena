// Load scenario: M students in a running contest submit at the same moment.
//
// The mix is 60% correct, 20% wrong answer and 20% infinite loops (the worst case for the
// judge, since every test runs to its time limit). Measured:
//   submitAck       HTTP round trip of POST .../submit (the 202 "queued" answer)
//   queueToVerdict  server createdAt -> judgedAt, from the database (queue wait + judging)
//   drainMs         first submission sent -> last verdict saved
//   wrongVerdicts   submissions whose verdict isn't the expected one
const ContestSubmission = require('../models/ContestSubmission')
const { summarize, pool, sleep, setupClass } = require('./common')

const CODES = {
  Accepted: 'function total(nums) { let s = 0; for (const n of nums) s += n; return s }',
  'Wrong Answer': 'function total(nums) { return nums.length }',
  'Time Limit Exceeded': 'function total(nums) { while (true) {} }',
}
const expectedFor = (i) => (i % 5 < 3 ? 'Accepted' : i % 5 === 3 ? 'Wrong Answer' : 'Time Limit Exceeded')

async function runJudge({ call, submitters, timeLimitMs = 300 }) {
  const { admin, cls, students } = await setupClass(call, { label: `judge${submitters}`, count: submitters })
  const hiddenTests = [[[]], [[5]], [[-3, 3]], [[1, 2, 3, 4, 5]], [Array.from({ length: 1000 }, (_, i) => i)]]
    .map((input) => ({ input, expected: input[0].reduce((a, b) => a + b, 0) }))
  const question = await call('POST', '/api/questions', {
    type: 'code', prompt: 'Total\nReturn the sum of nums.',
    code: { functionName: 'total', sampleTests: [{ input: [[1, 2]], expected: 3 }], hiddenTests, timeLimitMs },
  }, admin.accessToken)
  const contest = await call('POST', '/api/contests', { classId: cls.id, title: `Load contest ${submitters}` }, admin.accessToken)
  await call('PUT', `/api/contests/${contest.id}`, { durationMinutes: 60, problemIds: [question._id] }, admin.accessToken)
  await call('POST', `/api/contests/${contest.id}/start`, undefined, admin.accessToken)

  const submitAck = []
  const errors = []
  const ids = new Array(submitters)
  const startedAt = Date.now()
  await pool(submitters, submitters, async (i) => {
    const before = Date.now()
    try {
      const queued = await call('POST', `/api/contests/${contest.id}/problems/0/submit`, { code: CODES[expectedFor(i)] }, students[i].accessToken)
      submitAck.push(Date.now() - before)
      ids[i] = queued.id
    } catch (err) {
      errors.push(`submit ${i}: ${err.message}`)
    }
  })

  // Wait until every submission has a verdict (or give up after 5 minutes).
  let done = []
  for (let waited = 0; waited < 300000; waited += 1000) {
    done = await ContestSubmission.find({ contestId: contest.id, status: 'done' }).select('verdict createdAt judgedAt')
    if (done.length >= ids.filter(Boolean).length) break
    await sleep(1000)
  }
  const drainMs = done.length ? Math.max(...done.map((s) => s.judgedAt.getTime())) - startedAt : null
  const byId = new Map(done.map((s) => [s.id, s]))
  const wrong = ids.map((id, i) => [byId.get(id)?.verdict, expectedFor(i)]).filter(([got, want], i) => ids[i] && got !== want)
  const verdicts = {}
  for (const s of done) verdicts[s.verdict] = (verdicts[s.verdict] || 0) + 1

  return {
    scenario: 'contest-judge',
    submitters,
    mix: '60% correct, 20% wrong answer, 20% infinite loop',
    testsPerSubmission: 1 + hiddenTests.length,
    timeLimitMs,
    submitAckMs: summarize(submitAck),
    queueToVerdictMs: summarize(done.map((s) => s.judgedAt - s.createdAt)),
    drainMs,
    judged: done.length,
    throughputPerSecond: drainMs ? Math.round((done.length / (drainMs / 1000)) * 100) / 100 : null,
    verdicts,
    wrongVerdicts: wrong.length,
    errors: errors.length + (ids.filter(Boolean).length - done.length),
    errorSamples: errors.slice(0, 5),
  }
}

module.exports = { runJudge }
