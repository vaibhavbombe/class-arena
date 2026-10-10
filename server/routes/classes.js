const express = require('express')
const mongoose = require('mongoose')
const Class = require('../models/Class')
const Enrollment = require('../models/Enrollment')
const Test = require('../models/Test')
const Attempt = require('../models/Attempt')
const LiveQuiz = require('../models/LiveQuiz')
const User = require('../models/User')
const { requireAuth, requireRole } = require('../middleware/auth')
const { rejectInvalid } = require('../lib/validate')
const { normalizeJoinCode, withUniqueJoinCode } = require('../lib/joinCode')
const { findVisibleClass } = require('../lib/classAccess')
const LiveGame = require('../models/LiveGame')
const Question = require('../models/Question')
const { testStatus } = require('../lib/testRules')
const { GRACE_MS } = require('../lib/attemptRules')
const { finalizeAttempt } = require('../lib/finalizeAttempt')
const { classAnalytics } = require('../lib/analytics')

const router = express.Router()
router.use(requireAuth)

function classSummary(cls, { teacher, studentCount, includeJoinCode }) {
  return {
    id: cls._id,
    name: cls.name,
    subject: cls.subject,
    teacher: teacher ? { id: teacher._id, name: teacher.name } : null,
    ...(includeJoinCode && { joinCode: cls.joinCode }),
    ...(studentCount !== undefined && { studentCount }),
    createdAt: cls.createdAt,
  }
}

router.post('/', requireRole('teacher', 'admin'), async (req, res) => {
  if (rejectInvalid(res, req.body, ['name'])) return
  const subject = typeof req.body.subject === 'string' ? req.body.subject : ''

  const cls = await withUniqueJoinCode((joinCode) => Class.create({
    institutionId: req.institutionId,
    teacherId: req.userId,
    name: req.body.name,
    subject,
    joinCode,
  }))

  const teacher = await User.findById(req.userId).select('name')
  res.status(201).json(classSummary(cls, { teacher, studentCount: 0, includeJoinCode: true }))
})

router.get('/', async (req, res) => {
  let classes
  if (req.role === 'student') {
    const enrollments = await Enrollment.find({ studentId: req.userId, institutionId: req.institutionId }).select('classId')
    classes = await Class.find({ _id: { $in: enrollments.map((e) => e.classId) }, institutionId: req.institutionId })
  } else {
    const filter = { institutionId: req.institutionId }
    if (req.role === 'teacher') filter.teacherId = req.userId
    classes = await Class.find(filter)
  }
  classes.sort((a, b) => b.createdAt - a.createdAt)

  const teachers = await User.find({ _id: { $in: classes.map((c) => c.teacherId) } }).select('name')
  const teacherById = new Map(teachers.map((t) => [t._id.toString(), t]))

  // Staff see roster sizes and join codes; students don't need either.
  const isStaff = req.role !== 'student'
  const countById = new Map()
  if (isStaff && classes.length) {
    const counts = await Enrollment.aggregate([
      { $match: { classId: { $in: classes.map((c) => c._id) } } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ])
    counts.forEach((c) => countById.set(c._id.toString(), c.count))
  }

  res.json(classes.map((cls) => classSummary(cls, {
    teacher: teacherById.get(cls.teacherId.toString()),
    studentCount: isStaff ? countById.get(cls._id.toString()) || 0 : undefined,
    includeJoinCode: isStaff,
  })))
})

// A logged-in student joins another class. Only classes in their own institute
// count: a code from a different institute behaves exactly like a wrong code.
router.post('/join', requireRole('student'), async (req, res) => {
  const joinCode = normalizeJoinCode(req.body?.joinCode)
  const cls = joinCode && await Class.findOne({ joinCode, institutionId: req.institutionId })
  if (!cls) return res.status(404).json({ error: 'No class found with that code' })

  try {
    await Enrollment.create({ institutionId: req.institutionId, classId: cls._id, studentId: req.userId })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'You are already in this class' })
    throw err
  }

  const teacher = await User.findById(cls.teacherId).select('name')
  res.status(201).json(classSummary(cls, { teacher }))
})

// Class analytics for its teacher and admins (see lib/analytics.js for what's computed).
router.get('/:id/analytics', requireRole('teacher', 'admin'), async (req, res) => {
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const now = new Date()

  const testDocs = await Test.find({ institutionId: req.institutionId, classId: cls._id, status: 'published' })
  // Submit attempts whose time ran out, so they count (same as the results page does).
  const overdue = await Attempt.find({ classId: cls._id, institutionId: req.institutionId, status: 'in_progress', deadline: { $lt: new Date(now.getTime() - GRACE_MS) } })
  const testById = new Map(testDocs.map((test) => [test.id, test]))
  for (const attempt of overdue) {
    const test = testById.get(attempt.testId.toString())
    if (test) await finalizeAttempt(attempt, test, 'timeout', attempt.deadline)
  }

  const [attempts, enrollments, liveGames] = await Promise.all([
    Attempt.find({ classId: cls._id, institutionId: req.institutionId, status: 'submitted' }).select('testId studentId score maxScore submittedAt results'),
    Enrollment.find({ classId: cls._id }).select('studentId'),
    LiveGame.find({ classId: cls._id, institutionId: req.institutionId, status: 'ended' }).select('results.players'),
  ])
  const students = await User.find({ _id: { $in: enrollments.map((e) => e.studentId) }, institutionId: req.institutionId }).select('name')

  // Older test copies have no tags: fall back to the bank question's current tags.
  const untagged = testDocs.flatMap((test) => test.items.filter((item) => !item.tags?.length).map((item) => item.questionId))
  const bank = untagged.length ? await Question.find({ _id: { $in: untagged }, institutionId: req.institutionId }).select('tags') : []

  res.json(classAnalytics({
    tests: testDocs.map((test) => ({
      id: test.id,
      title: test.title,
      status: testStatus(test, now),
      when: test.opensAt || test.publishedAt,
      items: test.items.map((item) => ({ questionId: item.questionId.toString(), prompt: item.prompt, tags: item.tags })),
    })),
    attempts: attempts.map((attempt) => ({ ...attempt.toObject(), testId: attempt.testId.toString(), studentId: attempt.studentId.toString() })),
    students: students.map((student) => ({ id: student.id, name: student.name })),
    tagsByQuestionId: Object.fromEntries(bank.map((question) => [question.id, question.tags])),
    liveGames: liveGames.map((game) => ({ playerCount: game.results?.players?.length || 0 })),
  }))
})

router.get('/:id', async (req, res) => {
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  const teacher = await User.findById(cls.teacherId).select('name')
  if (req.role === 'student') {
    return res.json(classSummary(cls, { teacher }))
  }

  const enrollments = await Enrollment.find({ classId: cls._id }).sort({ joinedAt: 1 })
  const students = await User.find({ _id: { $in: enrollments.map((e) => e.studentId) }, institutionId: req.institutionId })
    .select('name email')
  const studentById = new Map(students.map((s) => [s._id.toString(), s]))

  res.json({
    ...classSummary(cls, { teacher, studentCount: enrollments.length, includeJoinCode: true }),
    students: enrollments
      .map((e) => ({ student: studentById.get(e.studentId.toString()), joinedAt: e.joinedAt }))
      .filter((row) => row.student)
      .map(({ student, joinedAt }) => ({ id: student._id, name: student.name, email: student.email, joinedAt })),
  })
})

// If a code leaks (posted publicly, say), staff can replace it. Existing students stay enrolled.
router.post('/:id/join-code', requireRole('teacher', 'admin'), async (req, res) => {
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  await withUniqueJoinCode((joinCode) => {
    cls.joinCode = joinCode
    return cls.save()
  })
  res.json({ joinCode: cls.joinCode })
})

// Admin hands a class to another teacher (e.g. before removing the current one).
router.patch('/:id/teacher', requireRole('admin'), async (req, res) => {
  if (rejectInvalid(res, req.body, ['teacherId'])) return
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  // The new teacher must be staff in the same institute.
  const teacher = mongoose.isValidObjectId(req.body.teacherId) && await User.findOne({
    _id: req.body.teacherId,
    institutionId: req.institutionId,
    role: { $in: ['teacher', 'admin'] },
  }).select('name')
  if (!teacher) return res.status(400).json({ error: 'Pick a teacher or admin from your institute' })

  cls.teacherId = teacher._id
  await cls.save()
  res.json(classSummary(cls, { teacher }))
})

// Staff remove one student from a class. The student's account stays.
router.delete('/:id/students/:studentId', requireRole('teacher', 'admin'), async (req, res) => {
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  if (!mongoose.isValidObjectId(req.params.studentId)) return res.status(404).json({ error: 'Student not found in this class' })

  const { deletedCount } = await Enrollment.deleteOne({ classId: cls._id, studentId: req.params.studentId })
  if (!deletedCount) return res.status(404).json({ error: 'Student not found in this class' })
  res.json({ message: 'Student removed from the class' })
})

// The class's teacher or an admin deletes it. Its tests and enrollments go first, then the class,
// so a failure halfway leaves nothing pointing at a missing class.
router.delete('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const cls = await findVisibleClass(req, req.params.id)
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  await LiveQuiz.deleteMany({ institutionId: req.institutionId, classId: cls._id })
  await Attempt.deleteMany({ institutionId: req.institutionId, classId: cls._id })
  await Test.deleteMany({ institutionId: req.institutionId, classId: cls._id })
  await Enrollment.deleteMany({ classId: cls._id })
  await Class.deleteOne({ _id: cls._id })
  res.json({ message: `"${cls.name}" was deleted` })
})

module.exports = router
