const express = require('express')
const mongoose = require('mongoose')
const Problem = require('../models/Problem')
const CodeSubmission = require('../models/CodeSubmission')
const Question = require('../models/Question')
const User = require('../models/User')
const Hint = require('../models/Hint')
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const { getRedis } = require('../lib/redis')
const views = require('../lib/problemViews')
const { finalizeSubmission, settleSubmission } = require('../lib/submissions')
const { enqueue, onJudgeResult } = require('../judge/queue')
const { LIMITS } = require('../judge/runner')
const hintService = require('../lib/ai/hintService')
const { requestFeedback } = require('../lib/ai/feedbackService')

// Coding practice: teachers assign coding questions to a class; students run samples in
// their browser and submit to the server judge. Submissions are queued, not awaited.
const router = express.Router()
router.use(requireAuth)

// When the worker publishes a result for a queued submission, save it.
onJudgeResult(finalizeSubmission)

const isStaff = (req) => req.role === 'teacher' || req.role === 'admin'
const SUBMIT_COOLDOWN_MS = 5000

async function findVisibleProblem(req, problemId) {
  if (!mongoose.isValidObjectId(problemId)) return null
  const problem = await Problem.findOne({ _id: problemId, institutionId: req.institutionId })
  if (!problem) return null
  return (await findVisibleClass(req, problem.classId)) ? problem : null
}

router.get('/', async (req, res) => {
  const cls = await findVisibleClass(req, req.query.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const problems = await Problem.find({ institutionId: req.institutionId, classId: cls._id }).sort({ createdAt: -1 })
  const ids = problems.map((p) => p._id)

  if (isStaff(req)) {
    // Distinct students who tried / solved each problem.
    const stats = await CodeSubmission.aggregate([
      { $match: { institutionId: new mongoose.Types.ObjectId(req.institutionId), problemId: { $in: ids } } },
      { $group: { _id: { problemId: '$problemId', studentId: '$studentId' }, solved: { $max: { $cond: [{ $eq: ['$verdict', 'Accepted'] }, 1, 0] } } } },
      { $group: { _id: '$_id.problemId', attempted: { $sum: 1 }, solved: { $sum: '$solved' } } },
    ])
    const byId = new Map(stats.map((s) => [s._id.toString(), s]))
    return res.json(problems.map((p) => ({
      id: p._id, title: p.title, difficulty: p.difficulty, createdAt: p.createdAt,
      attempted: byId.get(p.id)?.attempted || 0, solved: byId.get(p.id)?.solved || 0,
    })))
  }

  const mine = await CodeSubmission.find({ studentId: req.userId, problemId: { $in: ids } }).select('problemId verdict')
  res.json(problems.map((p) => {
    const subs = mine.filter((s) => s.problemId.toString() === p.id)
    return { id: p._id, title: p.title, difficulty: p.difficulty, createdAt: p.createdAt, status: views.problemStatus(subs), attempts: subs.length }
  }))
})

// Assign a coding question from the bank to a class (copied, hidden tests included).
router.post('/', requirePermission('coding.manage'), async (req, res) => {
  const cls = await findVisibleClass(req, req.body?.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  if (!mongoose.isValidObjectId(req.body.questionId)) return res.status(404).json({ error: 'Question not found' })
  const filter = { _id: req.body.questionId, institutionId: req.institutionId }
  if (req.role === 'teacher') filter.ownerId = req.userId
  const question = await Question.findOne(filter)
  if (!question) return res.status(404).json({ error: 'Question not found' })
  if (question.type !== 'code') return res.status(400).json({ error: 'Only coding questions can be practice problems' })

  const problem = await Problem.create({
    institutionId: req.institutionId,
    classId: cls._id,
    questionId: question._id,
    createdBy: req.userId,
    title: views.titleFrom(question.prompt),
    prompt: question.prompt,
    difficulty: question.difficulty,
    code: question.code.toObject(),
  })
  res.status(201).json(views.staffProblemView(problem))
})

function submissionSummary(s) {
  return { id: s._id, status: s.status, verdict: s.verdict, passed: s.passed, total: s.total, timeMs: s.timeMs, createdAt: s.createdAt }
}

router.get('/:id', async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })

  if (!isStaff(req)) {
    const mine = await CodeSubmission.find({ problemId: problem._id, studentId: req.userId }).sort({ createdAt: -1 }).limit(20)
    const hints = await hintService.hintsFor(problem._id, req.userId)
    return res.json({ ...views.studentProblemView(problem), status: views.problemStatus(mine), submissions: mine.map(submissionSummary), lastCode: mine[0]?.code ?? null, hints: hints.map(hintService.hintView) })
  }

  // Staff: each student's best verdict, attempts and latest submission.
  const subs = await CodeSubmission.find({ problemId: problem._id }).sort({ createdAt: -1 }).select('studentId verdict passed total createdAt status')
  const hintCounts = await Hint.aggregate([{ $match: { problemId: problem._id } }, { $group: { _id: '$studentId', count: { $sum: 1 } } }])
  const studentIds = new Set([...subs.map((s) => s.studentId.toString()), ...hintCounts.map((h) => h._id.toString())])
  const students = await User.find({ _id: { $in: [...studentIds] }, institutionId: req.institutionId }).select('name')
  const nameById = new Map(students.map((s) => [s.id, s.name]))
  const byStudent = new Map()
  for (const s of subs) {
    const key = s.studentId.toString()
    const row = byStudent.get(key) || { studentId: key, name: nameById.get(key) || 'Former student', attempts: 0, solved: false, best: null, latestSubmissionId: s.id, lastAt: s.createdAt }
    row.attempts++
    if (s.verdict === 'Accepted') row.solved = true
    if (s.passed !== null && (!row.best || s.passed > row.best.passed)) row.best = { passed: s.passed, total: s.total, verdict: s.verdict }
    byStudent.set(key, row)
  }
  for (const { _id, count } of hintCounts) {
    const key = _id.toString()
    const row = byStudent.get(key) || { studentId: key, name: nameById.get(key) || 'Former student', attempts: 0, solved: false, best: null, latestSubmissionId: null, lastAt: null }
    row.hintsUsed = count
    byStudent.set(key, row)
  }
  res.json({ ...views.staffProblemView(problem), students: [...byStudent.values()].sort((a, b) => Number(b.solved) - Number(a.solved) || a.name.localeCompare(b.name)) })
})

router.delete('/:id', requirePermission('coding.manage'), async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })
  await CodeSubmission.deleteMany({ problemId: problem._id })
  await Hint.deleteMany({ problemId: problem._id })
  await Problem.deleteOne({ _id: problem._id })
  res.json({ message: `"${problem.title}" was removed` })
})

// Queue a submission. Answers right away with the id; the result is saved when the judge
// publishes it, and the page checks GET .../submissions/:id.
router.post('/:id/submit', requireRole('student'), async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })
  const code = req.body?.code
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Write some code first' })
  if (code.length > LIMITS.maxCodeLength) return res.status(400).json({ error: `Code can be at most ${LIMITS.maxCodeLength} characters` })

  // One submission every few seconds per student, so nobody can flood the judge queue.
  const redis = getRedis()
  if (redis && !(await redis.set(`rate:submit:${req.userId}`, '1', 'PX', SUBMIT_COOLDOWN_MS, 'NX'))) {
    return res.status(429).json({ error: 'Please wait a few seconds between submissions' })
  }

  const submission = await CodeSubmission.create({
    institutionId: req.institutionId, classId: problem.classId, problemId: problem._id, studentId: req.userId, code,
  })
  const { functionName, sampleTests, hiddenTests, timeLimitMs, memoryMb } = problem.code
  await enqueue({
    code,
    functionName,
    // Samples first, then hidden; the full result comes back to the API only, and is
    // reduced to a student-safe summary in finalizeSubmission.
    tests: [...sampleTests, ...hiddenTests].map(({ input, expected }) => ({ input, expected })),
    timeLimitMs,
    memoryMb,
    revealAll: true,
  }, submission.id)
  res.status(202).json(submissionSummary(submission))
})

// The student's next hint (levels 1-3 in order). Practice problems only: contests and timed
// tests have no hints. The current editor code is optional and only used as context.
router.post('/:id/hints', requireRole('student'), async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })
  const code = req.body?.code
  if (code !== undefined && (typeof code !== 'string' || code.length > LIMITS.maxCodeLength)) return res.status(400).json({ error: 'code must be text' })
  const result = await hintService.nextHint({ problem, student: req, code })
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.status(201).json(result.hint)
})

// One submission: the student who made it, or staff of the class.
router.get('/:id/submissions/:submissionId', async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem || !mongoose.isValidObjectId(req.params.submissionId)) return res.status(404).json({ error: 'Submission not found' })
  const filter = { _id: req.params.submissionId, problemId: problem._id }
  if (!isStaff(req)) filter.studentId = req.userId
  let submission = await CodeSubmission.findOne(filter)
  if (!submission) return res.status(404).json({ error: 'Submission not found' })
  submission = await settleSubmission(submission)
  res.json({ ...submissionSummary(submission), code: submission.code, error: submission.error, tests: submission.tests, feedback: submission.feedback })
})

// A short review of the student's own judged submission (AI, or fixed feedback if the AI is
// unavailable). Written once per submission; asking again returns the saved review.
router.post('/:id/submissions/:submissionId/feedback', requireRole('student'), async (req, res) => {
  const problem = await findVisibleProblem(req, req.params.id)
  if (!problem || !mongoose.isValidObjectId(req.params.submissionId)) return res.status(404).json({ error: 'Submission not found' })
  let submission = await CodeSubmission.findOne({ _id: req.params.submissionId, problemId: problem._id, studentId: req.userId })
  if (!submission) return res.status(404).json({ error: 'Submission not found' })
  submission = await settleSubmission(submission)
  const result = await requestFeedback({ problem, submission, student: req })
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result.feedback)
})

module.exports = router
