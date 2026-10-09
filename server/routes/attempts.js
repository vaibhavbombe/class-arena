const express = require('express')
const mongoose = require('mongoose')
const Test = require('../models/Test')
const Attempt = require('../models/Attempt')
const { requireAuth, requireRole } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const { testStatus } = require('../lib/testRules')
const rules = require('../lib/attemptRules')
const { finalizeAttempt } = require('../lib/finalizeAttempt')

// Mounted at /api/tests/:testId/attempt. Students take tests here; every time limit
// is checked against the server's clock.
const router = express.Router({ mergeParams: true })
router.use(requireAuth, requireRole('student'))

// A published test in a class the student is enrolled in, or null (answered with 404).
async function findStudentTest(req) {
  if (!mongoose.isValidObjectId(req.params.testId)) return null
  const test = await Test.findOne({ _id: req.params.testId, institutionId: req.institutionId, status: 'published' })
  if (!test) return null
  return (await findVisibleClass(req, test.classId)) ? test : null
}

// Loads the student's attempt and, if its time is up, submits it on the spot.
// This is what makes the deadline hold even if the browser was closed.
async function loadAttempt(req, test, now) {
  const attempt = await Attempt.findOne({ testId: test._id, studentId: req.userId, institutionId: req.institutionId })
  if (attempt && attempt.status === 'in_progress' && rules.isPastDeadline(attempt, now)) {
    return finalizeAttempt(attempt, test, 'timeout', attempt.deadline)
  }
  return attempt
}

// Start, or resume if already started (safe to call twice).
router.post('/', async (req, res) => {
  const now = new Date()
  const test = await findStudentTest(req)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const existing = await loadAttempt(req, test, now)
  if (existing) return res.json(rules.studentAttemptView(test, existing, now))

  const status = testStatus(test, now)
  if (status === 'upcoming') return res.status(409).json({ error: 'This test has not opened yet' })
  if (status === 'closed') return res.status(409).json({ error: 'This test has closed' })

  try {
    const attempt = await Attempt.create({
      institutionId: req.institutionId,
      testId: test._id,
      classId: test.classId,
      studentId: req.userId,
      startedAt: now,
      deadline: rules.deadlineFor(test, now),
      answers: rules.emptyAnswers(test),
      ...rules.layoutFor(test),
    })
    res.status(201).json(rules.studentAttemptView(test, attempt, now))
  } catch (err) {
    // Two "Start" requests at once: the unique index lets only one create; return that one.
    if (err.code !== 11000) throw err
    const attempt = await Attempt.findOne({ testId: test._id, studentId: req.userId })
    res.json(rules.studentAttemptView(test, attempt, now))
  }
})

router.get('/', async (req, res) => {
  const now = new Date()
  const test = await findStudentTest(req)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  const attempt = await loadAttempt(req, test, now)
  if (!attempt) return res.status(404).json({ error: 'Not started' })
  res.json(rules.studentAttemptView(test, attempt, now))
})

// Saves one or more answers: [{ index, selectedOptionIds } | { index, text }].
// Each answer is written on its own (atomic $set), and only while the attempt is open.
async function saveAnswers(req, test, attempt, batch, now) {
  const { updates, error } = rules.parseAnswerBatch(test, batch)
  if (error) return { status: 400, error }
  if (!updates.size) return { attempt }

  const $set = {}
  for (const [index, answer] of updates) $set[`answers.${index}`] = answer
  const saved = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in_progress', deadline: { $gte: new Date(now.getTime() - rules.GRACE_MS) } },
    { $set, $inc: { revision: 1 } },
    { new: true },
  )
  if (!saved) return { status: 409, error: 'This attempt has already been submitted' }
  return { attempt: saved }
}

router.put('/answers', async (req, res) => {
  const now = new Date()
  const test = await findStudentTest(req)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  const attempt = await loadAttempt(req, test, now)
  if (!attempt) return res.status(404).json({ error: 'Not started' })
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'This attempt has already been submitted' })

  const result = await saveAnswers(req, test, attempt, req.body?.answers, now)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json({ savedAt: now, revision: result.attempt.revision })
})

// Submits (optionally with a final batch of answers). Calling it again is harmless.
router.post('/submit', async (req, res) => {
  const now = new Date()
  const test = await findStudentTest(req)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  let attempt = await loadAttempt(req, test, now)
  if (!attempt) return res.status(404).json({ error: 'Not started' })

  if (attempt.status === 'in_progress') {
    if (req.body?.answers) {
      const result = await saveAnswers(req, test, attempt, req.body.answers, now)
      if (result.error && result.status === 400) return res.status(400).json({ error: result.error })
      if (result.attempt) attempt = result.attempt
    }
    attempt = await finalizeAttempt(attempt, test, 'student', now)
  }
  res.json(rules.studentAttemptView(test, attempt, now))
})

module.exports = router
