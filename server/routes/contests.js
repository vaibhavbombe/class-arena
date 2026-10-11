const express = require('express')
const mongoose = require('mongoose')
const Contest = require('../models/Contest')
const ContestSubmission = require('../models/ContestSubmission')
const Question = require('../models/Question')
const Enrollment = require('../models/Enrollment')
const User = require('../models/User')
const { requireAuth, requireRole } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const { getRedis } = require('../lib/redis')
const rules = require('../lib/contestRules')
const contests = require('../lib/contests')
const views = require('../lib/problemViews')
const { enqueue, onJudgeResult } = require('../judge/queue')
const { LIMITS } = require('../judge/runner')

// Live coding contests (ICPC style). The server's clock decides everything: when problems
// become visible, whether a submission is accepted, its penalty time and the freeze.
const router = express.Router()
router.use(requireAuth)

onJudgeResult(contests.finalizeContestSubmission)

const staffOnly = requireRole('teacher', 'admin')
const SUBMIT_COOLDOWN_MS = 5000
const notStarted = (contest) => ['draft', 'upcoming'].includes(rules.contestStatus(contest))

router.get('/', async (req, res) => {
  const cls = await findVisibleClass(req, req.query.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const filter = { institutionId: req.institutionId, classId: cls._id }
  if (!contests.isStaff(req)) filter.published = true
  const list = await Contest.find(filter).sort({ createdAt: -1 })
  const now = new Date()
  res.json(list.map((c) => contests.summary(c, now)))
})

router.post('/', staffOnly, async (req, res) => {
  const cls = await findVisibleClass(req, req.body?.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const { error, changes } = rules.parseSettings({ title: req.body.title ?? '' })
  if (error) return res.status(400).json({ error })
  const contest = await Contest.create({ institutionId: req.institutionId, classId: cls._id, createdBy: req.userId, ...changes })
  res.status(201).json(contests.staffContestView(contest))
})

router.get('/:id', async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  if (contests.isStaff(req)) return res.json(contests.staffContestView(contest))

  const view = contests.studentContestView(contest)
  await contests.settleContestSubmissions(contest._id)
  const mine = await ContestSubmission.find({ contestId: contest._id, studentId: req.userId }).sort({ createdAt: -1 })
  res.json({
    ...view,
    submissions: mine.map(contests.submissionSummary),
    // The newest code per problem, so a refresh doesn't lose work.
    lastCode: Object.fromEntries(view.problems.map((p) => [p.index, mine.find((s) => s.problemIndex === p.index)?.code ?? null])),
  })
})

// Settings and problems can change only before the start; after that, just the title.
router.put('/:id', staffOnly, async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  const body = req.body || {}
  if (!notStarted(contest) && Object.keys(body).some((key) => key !== 'title')) {
    return res.status(409).json({ error: 'This contest has started; only its title can change' })
  }
  const { error, changes } = rules.parseSettings(body, contest)
  if (error) return res.status(400).json({ error })
  if (contest.published && 'startsAt' in changes && (!changes.startsAt || changes.startsAt <= new Date())) {
    return res.status(400).json({ error: 'A published contest needs a start time in the future' })
  }

  if ('problemIds' in body) {
    const parsed = rules.parseProblemIds(body.problemIds)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const filter = { _id: { $in: parsed.ids }, institutionId: req.institutionId }
    if (req.role === 'teacher') filter.ownerId = req.userId
    const found = await Question.find(filter)
    const byId = new Map(found.map((q) => [q.id, q]))
    if (parsed.ids.some((id) => !byId.has(id))) return res.status(404).json({ error: 'Question not found' })
    if (found.some((q) => q.type !== 'code')) return res.status(400).json({ error: 'Contests can only contain coding questions' })
    changes.problems = parsed.ids.map((id) => {
      const q = byId.get(id)
      return { questionId: q._id, title: views.titleFrom(q.prompt), prompt: q.prompt, difficulty: q.difficulty, code: q.code.toObject() }
    })
  }

  contest.set(changes)
  await contest.save()
  res.json(contests.staffContestView(contest))
})

// Publish for a scheduled start (needs a future start time), or take it back before it starts.
router.post('/:id/publish', staffOnly, async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  if (!notStarted(contest)) return res.status(409).json({ error: 'This contest has already started' })
  const published = req.body?.published !== false
  if (published) {
    if (!contest.problems.length) return res.status(400).json({ error: 'Add at least one problem first' })
    if (!contest.startsAt || contest.startsAt <= new Date()) return res.status(400).json({ error: 'Set a start time in the future, or use Start now' })
  }
  contest.published = published
  await contest.save()
  res.json(contests.staffContestView(contest))
})

router.post('/:id/start', staffOnly, async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  if (!notStarted(contest)) return res.status(409).json({ error: 'This contest has already started' })
  if (!contest.problems.length) return res.status(400).json({ error: 'Add at least one problem first' })
  contest.set({ published: true, startsAt: new Date() })
  await contest.save()
  res.json(contests.staffContestView(contest))
})

router.delete('/:id', staffOnly, async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  await ContestSubmission.deleteMany({ contestId: contest._id })
  await Contest.deleteOne({ _id: contest._id })
  res.json({ message: `"${contest.title}" was deleted` })
})

// The board for whoever is asking: staff always live, students frozen during the freeze.
router.get('/:id/standings', async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  const now = new Date()
  const status = rules.contestStatus(contest, now)
  const problems = notStarted(contest) && !contests.isStaff(req) ? [] : contest.problems.map((p, i) => ({ label: rules.label(i), title: p.title }))
  if (status === 'draft') return res.json({ status, frozen: false, problems, rows: [] })

  await contests.settleContestSubmissions(contest._id)
  const [enrolled, submissions] = await Promise.all([
    Enrollment.find({ classId: contest.classId }).select('studentId'),
    ContestSubmission.find({ contestId: contest._id }).select('studentId problemIndex verdict status createdAt'),
  ])
  const ids = [...new Set([...enrolled.map((e) => e.studentId.toString()), ...submissions.map((s) => s.studentId.toString())])]
  const users = await User.find({ _id: { $in: ids }, institutionId: req.institutionId }).select('name')
  const names = new Map(users.map((u) => [u.id, u.name]))
  const board = rules.standings({
    contest,
    submissions: submissions.map((s) => ({ ...s.toObject(), studentName: names.get(s.studentId.toString()) })),
    students: enrolled.map((e) => ({ id: e.studentId.toString(), name: names.get(e.studentId.toString()) || 'Former student' })),
    now,
    staff: contests.isStaff(req),
  })
  res.json({
    status,
    frozen: board.frozen,
    freezesAt: rules.freezesAt(contest),
    penaltyMinutes: contest.penaltyMinutes,
    problems,
    rows: board.rows.map((row) => ({ ...row, me: row.studentId === req.userId })),
  })
})

router.post('/:id/problems/:index/submit', requireRole('student'), async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest) return res.status(404).json({ error: 'Contest not found' })
  const status = rules.contestStatus(contest)
  if (status !== 'running' && status !== 'frozen') {
    return res.status(409).json({ error: status === 'ended' ? 'The contest has ended' : 'The contest has not started yet' })
  }
  const index = Number(req.params.index)
  const problem = Number.isInteger(index) ? contest.problems[index] : null
  if (!problem) return res.status(404).json({ error: 'Problem not found' })
  const code = req.body?.code
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Write some code first' })
  if (code.length > LIMITS.maxCodeLength) return res.status(400).json({ error: `Code can be at most ${LIMITS.maxCodeLength} characters` })

  const redis = getRedis()
  if (redis && !(await redis.set(`rate:submit:${req.userId}`, '1', 'PX', SUBMIT_COOLDOWN_MS, 'NX'))) {
    return res.status(429).json({ error: 'Please wait a few seconds between submissions' })
  }

  const submission = await ContestSubmission.create({
    institutionId: req.institutionId, contestId: contest._id, studentId: req.userId, problemIndex: index, code,
  })
  const { functionName, sampleTests, hiddenTests, timeLimitMs, memoryMb } = problem.code
  await enqueue({
    code,
    functionName,
    tests: [...sampleTests, ...hiddenTests].map(({ input, expected }) => ({ input, expected })),
    timeLimitMs,
    memoryMb,
    revealAll: true,
  }, contests.JOB_PREFIX + submission.id)
  contests.contestChanged(contest._id)
  res.status(202).json(contests.submissionSummary(submission))
})

// One submission: the student who made it, or staff of the class.
router.get('/:id/submissions/:submissionId', async (req, res) => {
  const contest = await contests.findVisibleContest(req, req.params.id)
  if (!contest || !mongoose.isValidObjectId(req.params.submissionId)) return res.status(404).json({ error: 'Submission not found' })
  const filter = { _id: req.params.submissionId, contestId: contest._id }
  if (!contests.isStaff(req)) filter.studentId = req.userId
  if (!(await ContestSubmission.exists(filter))) return res.status(404).json({ error: 'Submission not found' })
  await contests.settleContestSubmissions(contest._id)
  const submission = await ContestSubmission.findOne(filter)
  res.json({ ...contests.submissionSummary(submission), code: submission.code, error: submission.error, tests: submission.tests })
})

module.exports = router
