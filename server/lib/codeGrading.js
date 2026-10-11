const mongoose = require('mongoose')
const Attempt = require('../models/Attempt')
const { enqueue, onJudgeResult, getResult } = require('../judge/queue')
const { codePoints } = require('./grading')

// Coding questions inside timed tests. When an attempt is submitted, every coding answer
// with code is queued for the judge against the HIDDEN tests only (so hard-coding the
// visible samples earns nothing). Each result sets that question's points (points x passed
// / total) and the attempt's score in one atomic update.

const JOB_PREFIX = 'attempt:'
const STALE_MS = 3 * 60 * 1000
const jobId = (attemptId, index) => `${JOB_PREFIX}${attemptId}:${index}`

function parseJobId(id) {
  if (typeof id !== 'string' || !id.startsWith(JOB_PREFIX)) return null
  const [attemptId, index] = id.slice(JOB_PREFIX.length).split(':')
  if (!mongoose.isValidObjectId(attemptId) || !/^\d+$/.test(index)) return null
  return { attemptId, index: Number(index) }
}

async function queueCodeGrading(attempt, test) {
  const pending = (attempt.results || []).filter((result) => result.pending).map((result) => result.index)
  if (!pending.length) return
  await Attempt.updateOne({ _id: attempt._id }, { $set: { codePending: pending } })
  for (const index of pending) {
    const { functionName, hiddenTests, timeLimitMs, memoryMb } = test.items[index].code
    await enqueue({
      code: attempt.answers[index].text,
      functionName,
      tests: hiddenTests.map(({ input, expected }) => ({ input, expected })),
      timeLimitMs,
      memoryMb,
    }, jobId(attempt._id, index))
  }
}

// Writes one coding question's result and recomputes the score, atomically.
async function applyCodeResult(attemptId, index, result) {
  const attempt = await Attempt.findOne({ _id: attemptId, codePending: index }).select('results')
  if (!attempt) return null // already applied (duplicate message) or attempt gone
  const max = attempt.results[index].max
  const passed = result?.passed ?? 0
  const total = result?.total ?? 0
  const graded = {
    index,
    max,
    pending: false,
    verdict: result?.verdict || 'Judge Error',
    passed,
    total,
    earned: result ? codePoints(max, passed, total) : 0,
    correct: Boolean(result && total > 0 && passed === total),
  }
  // Update pipeline: set this result, drop the index from codePending, re-sum the score.
  return Attempt.findOneAndUpdate(
    { _id: attemptId, codePending: index },
    [
      { $set: { results: { $map: { input: '$results', as: 'r', in: { $cond: [{ $eq: ['$$r.index', index] }, graded, '$$r'] } } } } },
      { $set: { codePending: { $filter: { input: '$codePending', as: 'i', cond: { $ne: ['$$i', index] } } } } },
      { $set: { score: { $round: [{ $sum: '$results.earned' }, 2] } } },
    ],
    { returnDocument: 'after', updatePipeline: true }, // Mongoose 9 requires opting in to pipeline updates
  )
}

onJudgeResult(async (id, result) => {
  const job = parseJobId(id)
  if (job) await applyCodeResult(job.attemptId, job.index, result)
})

// For attempts still waiting when someone looks: pick up results the listener missed, and
// after a few minutes give up on lost jobs (0 points, "Judge Error") so grading always ends.
async function settleCodeGrading(attempt) {
  if (!attempt?.codePending?.length) return attempt
  let current = attempt
  const stale = attempt.submittedAt && Date.now() - attempt.submittedAt.getTime() > STALE_MS
  for (const index of [...attempt.codePending]) {
    const result = await getResult(jobId(attempt._id, index))
    if (result || stale) current = (await applyCodeResult(attempt._id, index, result)) || current
  }
  return current
}

module.exports = { queueCodeGrading, applyCodeResult, settleCodeGrading, jobId, parseJobId, STALE_MS }
