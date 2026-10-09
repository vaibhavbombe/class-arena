const express = require('express')
const mongoose = require('mongoose')
const Question = require('../models/Question')
const User = require('../models/User')
const { requireAuth, requireRole } = require('../middleware/auth')
const { parseQuestionInput } = require('../lib/questionInput')

// The question bank holds correct answers, so the whole router is staff-only.
// Students only ever see questions through test views that strip the answers.
const router = express.Router()
router.use(requireAuth, requireRole('teacher', 'admin'))

// Teachers see their own questions; admins see every question in the institute.
function visibleFilter(req) {
  const filter = { institutionId: req.institutionId }
  if (req.role === 'teacher') filter.ownerId = req.userId
  return filter
}

async function findVisibleQuestion(req, id) {
  if (!mongoose.isValidObjectId(id)) return null
  return Question.findOne({ _id: id, ...visibleFilter(req) })
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

router.get('/', async (req, res) => {
  const filter = visibleFilter(req)
  if (Question.TYPES.includes(req.query.type)) filter.type = req.query.type
  if (typeof req.query.tag === 'string' && req.query.tag.trim()) filter.tags = req.query.tag.trim().toLowerCase()
  // Escaped, so search text can't become a slow or malicious regular expression.
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    filter.prompt = { $regex: escapeRegex(req.query.q.trim().slice(0, 100)), $options: 'i' }
  }

  const questions = await Question.find(filter).sort({ updatedAt: -1 }).limit(500)
  const owners = await User.find({ _id: { $in: [...new Set(questions.map((q) => q.ownerId.toString()))] } }).select('name')
  const ownerById = new Map(owners.map((owner) => [owner._id.toString(), owner.name]))
  res.json(questions.map((question) => ({ ...question.toObject(), ownerName: ownerById.get(question.ownerId.toString()) || null })))
})

// Every tag in use, for the filter dropdown.
router.get('/tags', async (req, res) => {
  const tags = await Question.distinct('tags', visibleFilter(req))
  res.json(tags.sort())
})

router.get('/:id', async (req, res) => {
  const question = await findVisibleQuestion(req, req.params.id)
  if (!question) return res.status(404).json({ error: 'Question not found' })
  res.json(question)
})

router.post('/', async (req, res) => {
  const { question, error } = parseQuestionInput(req.body)
  if (error) return res.status(400).json({ error })
  const created = await Question.create({ ...question, institutionId: req.institutionId, ownerId: req.userId })
  res.status(201).json(created)
})

// Editing a question doesn't change tests that already use it: tests keep their own
// copy of each question (step 2.2), so results stay consistent with what was asked.
router.put('/:id', async (req, res) => {
  const existing = await findVisibleQuestion(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Question not found' })
  const { question, error } = parseQuestionInput(req.body)
  if (error) return res.status(400).json({ error })

  existing.set(question)
  await existing.save()
  res.json(existing)
})

router.delete('/:id', async (req, res) => {
  const existing = await findVisibleQuestion(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Question not found' })
  await Question.deleteOne({ _id: existing._id })
  res.json({ message: 'Question deleted' })
})

module.exports = router
