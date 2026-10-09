const express = require('express')
const mongoose = require('mongoose')
const Test = require('../models/Test')
const Question = require('../models/Question')
const Attempt = require('../models/Attempt')
const { requireAuth, requireRole } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const rules = require('../lib/testRules')

const router = express.Router()
router.use(requireAuth)

const isStaff = (req) => req.role === 'teacher' || req.role === 'admin'

// A test is visible if its class is visible to the caller; students only see
// published tests. Returns null (answered with 404) otherwise.
async function findVisibleTest(req, testId) {
  if (!mongoose.isValidObjectId(testId)) return null
  const test = await Test.findOne({ _id: testId, institutionId: req.institutionId })
  if (!test) return null
  const cls = await findVisibleClass(req, test.classId)
  if (!cls) return null
  if (!isStaff(req) && test.status !== 'published') return null
  return test
}

// Bank questions this caller may put in a test: teachers their own, admins any in the institute.
function questionFilter(req, ids) {
  const filter = { _id: { $in: ids }, institutionId: req.institutionId }
  if (req.role === 'teacher') filter.ownerId = req.userId
  return filter
}

router.get('/', async (req, res) => {
  const cls = await findVisibleClass(req, req.query.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  const now = new Date()
  const filter = { institutionId: req.institutionId, classId: cls._id }
  if (!isStaff(req)) filter.status = 'published'
  const tests = await Test.find(filter).sort({ createdAt: -1 })
  if (isStaff(req)) {
    const counts = await Attempt.aggregate([
      { $match: { institutionId: new mongoose.Types.ObjectId(req.institutionId), testId: { $in: tests.map((test) => test._id) } } },
      { $group: { _id: '$testId', started: { $sum: 1 }, submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } } } },
    ])
    const countById = new Map(counts.map((c) => [c._id.toString(), { started: c.started, submitted: c.submitted }]))
    return res.json(tests.map((test) => ({ ...rules.staffSummary(test, now), attempts: countById.get(test._id.toString()) || { started: 0, submitted: 0 } })))
  }

  // Students also see where they are with each test.
  const mine = await Attempt.find({ institutionId: req.institutionId, studentId: req.userId, testId: { $in: tests.map((test) => test._id) } })
    .select('testId status deadline submittedAt')
  const mineById = new Map(mine.map((attempt) => [attempt.testId.toString(), attempt]))
  res.json(tests.map((test) => {
    const attempt = mineById.get(test._id.toString())
    return {
      ...rules.studentOutline(test, now),
      myAttempt: attempt ? { status: attempt.status, deadline: attempt.deadline, submittedAt: attempt.submittedAt } : null,
    }
  }))
})

// Creates an empty draft in a class the caller teaches (or any class, for admins).
router.post('/', requireRole('teacher', 'admin'), async (req, res) => {
  const cls = await findVisibleClass(req, req.body?.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  const { changes, error } = rules.parseSettings({ title: 'Untitled test', durationMinutes: 30, ...pick(req.body, ['title', 'durationMinutes']) })
  if (error) return res.status(400).json({ error })
  const test = await Test.create({ ...changes, institutionId: req.institutionId, classId: cls._id, ownerId: req.userId })
  res.status(201).json(rules.staffDetail(test))
})

router.get('/:id', async (req, res) => {
  const test = await findVisibleTest(req, req.params.id)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  res.json(isStaff(req) ? rules.staffDetail(test) : rules.studentOutline(test))
})

router.put('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const test = await findVisibleTest(req, req.params.id)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  const body = req.body ?? {}

  if (test.status === 'published') {
    const locked = rules.lockedFieldsIn(body)
    if (locked.length) {
      return res.status(409).json({ error: `This test is published, so ${locked.join(', ')} can't change. Only the title, instructions and closing time can.` })
    }
  }

  const { changes, error } = rules.parseSettings(body, test)
  if (error) return res.status(400).json({ error })

  if ('items' in body) {
    const parsed = rules.parseItems(body.items)
    if (parsed.error) return res.status(400).json({ error: parsed.error })

    // Keep the copy already in the test; copy anything new from the bank.
    const existing = new Map(test.items.map((item) => [item.questionId.toString(), item]))
    const newIds = parsed.items.map((item) => item.questionId).filter((qid) => !existing.has(qid))
    const fresh = await Question.find(questionFilter(req, newIds))
    const freshById = new Map(fresh.map((question) => [question._id.toString(), question]))
    if (fresh.length !== newIds.length) return res.status(400).json({ error: 'Some questions were not found in your question bank' })

    changes.items = parsed.items.map(({ questionId, points }) => {
      const kept = existing.get(questionId)
      return kept ? { ...kept.toObject(), points } : rules.snapshotOf(freshById.get(questionId), points)
    })
  }

  test.set(changes)
  await test.save()
  res.json(rules.staffDetail(test))
})

// Publishing refreshes each copy from the bank one last time (if the question still
// exists), then locks questions, points and timing.
router.post('/:id/publish', requireRole('teacher', 'admin'), async (req, res) => {
  const test = await findVisibleTest(req, req.params.id)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  if (test.status === 'published') return res.status(409).json({ error: 'This test is already published' })
  const problem = rules.publishProblem(test)
  if (problem) return res.status(400).json({ error: problem })

  const current = await Question.find({ _id: { $in: test.items.map((item) => item.questionId) }, institutionId: req.institutionId })
  const currentById = new Map(current.map((question) => [question._id.toString(), question]))
  test.items = test.items.map((item) => {
    const latest = currentById.get(item.questionId.toString())
    return latest ? rules.snapshotOf(latest, item.points) : item.toObject()
  })
  test.status = 'published'
  test.publishedAt = new Date()
  await test.save()
  res.json(rules.staffDetail(test))
})

router.delete('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const test = await findVisibleTest(req, req.params.id)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  // Students' work would be lost; a test that has been taken stays.
  const taken = await Attempt.countDocuments({ testId: test._id })
  if (taken) return res.status(409).json({ error: `${taken} student${taken > 1 ? 's have' : ' has'} already started this test, so it can't be deleted` })
  await Test.deleteOne({ _id: test._id })
  res.json({ message: `"${test.title}" was deleted` })
})

function pick(object, keys) {
  return Object.fromEntries(keys.filter((key) => object && key in object).map((key) => [key, object[key]]))
}

module.exports = router
