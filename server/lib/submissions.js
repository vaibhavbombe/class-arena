const CodeSubmission = require('../models/CodeSubmission')
const Problem = require('../models/Problem')
const { studentResult } = require('./problemViews')
const { getResult } = require('../judge/queue')

// A queued submission with no result after this long is marked as a judge error.
const STALE_MS = 3 * 60 * 1000

// Saves a judge result onto its submission (student-safe summary only). Only moves
// 'queued' -> 'done', so a duplicate message can't overwrite anything.
async function finalizeSubmission(id, result) {
  const submission = await CodeSubmission.findOne({ _id: id, status: 'queued' })
  if (!submission) return null
  const problem = await Problem.findById(submission.problemId).select('code.sampleTests')
  const sampleCount = problem ? problem.code.sampleTests.length : 0
  const safe = result
    ? studentResult(result, sampleCount)
    : { verdict: 'Judge Error', passed: 0, total: 0, timeMs: null, error: 'The judge did not return a result', tests: [] }
  return CodeSubmission.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'done', ...safe, judgedAt: new Date() } },
    { returnDocument: 'after' },
  )
}

// For a submission still marked 'queued' when someone looks at it: pick up a result the
// listener missed (e.g. published while the API restarted), or give up if it's stale.
async function settleSubmission(submission) {
  if (submission.status !== 'queued') return submission
  const result = await getResult(submission.id)
  if (result) return (await finalizeSubmission(submission.id, result)) || submission
  if (Date.now() - submission.createdAt.getTime() > STALE_MS) {
    return (await CodeSubmission.findOneAndUpdate(
      { _id: submission.id, status: 'queued' },
      { $set: { status: 'done', verdict: 'Judge Error', passed: 0, total: 0, error: 'The judge did not respond. Please submit again.', judgedAt: new Date() } },
      { returnDocument: 'after' },
    )) || submission
  }
  return submission
}

module.exports = { finalizeSubmission, settleSubmission, STALE_MS }
