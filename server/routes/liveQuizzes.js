const express = require('express')
const mongoose = require('mongoose')
const LiveQuiz = require('../models/LiveQuiz')
const Question = require('../models/Question')
const { requireAuth, requireRole } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const rules = require('../lib/liveQuizRules')

// Quizzes contain correct answers, so authoring is staff-only. Students only ever see
// questions during a game, without answers until the reveal (step 3.3).
const router = express.Router()
router.use(requireAuth, requireRole('teacher', 'admin'))

// A quiz in a class the caller can see (teachers: their classes; admins: any), or null.
async function findVisibleQuiz(req, quizId) {
  if (!mongoose.isValidObjectId(quizId)) return null
  const quiz = await LiveQuiz.findOne({ _id: quizId, institutionId: req.institutionId })
  if (!quiz) return null
  return (await findVisibleClass(req, quiz.classId)) ? quiz : null
}

router.get('/', async (req, res) => {
  const cls = await findVisibleClass(req, req.query.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const quizzes = await LiveQuiz.find({ institutionId: req.institutionId, classId: cls._id }).sort({ updatedAt: -1 })
  res.json(quizzes.map(rules.summary))
})

router.post('/', async (req, res) => {
  const cls = await findVisibleClass(req, req.body?.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const { title, error } = rules.parseTitle(req.body.title ?? 'Untitled live quiz')
  if (error) return res.status(400).json({ error })
  const quiz = await LiveQuiz.create({ institutionId: req.institutionId, classId: cls._id, ownerId: req.userId, title })
  res.status(201).json(rules.detail(quiz))
})

router.get('/:id', async (req, res) => {
  const quiz = await findVisibleQuiz(req, req.params.id)
  if (!quiz) return res.status(404).json({ error: 'Live quiz not found' })
  res.json(rules.detail(quiz))
})

router.put('/:id', async (req, res) => {
  const quiz = await findVisibleQuiz(req, req.params.id)
  if (!quiz) return res.status(404).json({ error: 'Live quiz not found' })
  const body = req.body ?? {}

  if ('title' in body) {
    const { title, error } = rules.parseTitle(body.title)
    if (error) return res.status(400).json({ error })
    quiz.title = title
  }

  if ('items' in body) {
    const parsed = rules.parseItems(body.items)
    if (parsed.error) return res.status(400).json({ error: parsed.error })

    // Keep copies already in the quiz; copy new ones from the bank (teachers: their own questions).
    const existing = new Map(quiz.items.map((item) => [item.questionId.toString(), item]))
    const newIds = parsed.items.map((item) => item.questionId).filter((qid) => !existing.has(qid))
    const filter = { _id: { $in: newIds }, institutionId: req.institutionId }
    if (req.role === 'teacher') filter.ownerId = req.userId
    const fresh = await Question.find(filter)
    if (fresh.length !== newIds.length) return res.status(400).json({ error: 'Some questions were not found in your question bank' })
    const freshById = new Map(fresh.map((question) => [question._id.toString(), question]))

    const items = []
    for (const { questionId, seconds } of parsed.items) {
      const kept = existing.get(questionId)
      if (kept) {
        items.push({ ...kept.toObject(), seconds })
        continue
      }
      const { item, error } = rules.snapshotOf(freshById.get(questionId), seconds)
      if (error) return res.status(400).json({ error })
      items.push(item)
    }
    quiz.items = items
  }

  await quiz.save()
  res.json(rules.detail(quiz))
})

router.delete('/:id', async (req, res) => {
  const quiz = await findVisibleQuiz(req, req.params.id)
  if (!quiz) return res.status(404).json({ error: 'Live quiz not found' })
  await LiveQuiz.deleteOne({ _id: quiz._id })
  res.json({ message: `"${quiz.title}" was deleted` })
})

module.exports = router
