const express = require('express')
const mongoose = require('mongoose')
const Question = require('../models/Question')
const User = require('../models/User')
const { requireAuth, requirePermission } = require('../middleware/auth')
const { parseQuestionInput, cleanCode } = require('../lib/questionInput')
const { judgeCode } = require('../judge/queue')
const generator = require('../lib/ai/generator')
const { aiConfig, chatJSON } = require('../lib/ai/client')
const { spendBudget, claimCooldown } = require('../lib/ai/budget')

const GENERATE = { perTeacherPerDay: 20, cooldownMs: 15000 }

// The question bank holds correct answers, so the whole router is staff-only.
// Students only ever see questions through test views that strip the answers.
const router = express.Router()
router.use(requireAuth, requirePermission('questions.manage'))

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

// "Check with judge": runs a solution (normally the reference solution) through the real
// judge against every sample and hidden test, showing all inputs and outputs. Staff only,
// so revealing the hidden tests here is fine. Catches wrong expected values before saving.
router.post('/check-code', async (req, res) => {
  const { code, error } = cleanCode(req.body?.code)
  if (error) return res.status(400).json({ error })
  const solution = req.body?.solution
  if (typeof solution !== 'string' || !solution.trim()) return res.status(400).json({ error: 'Write a solution to check' })

  const tests = [...code.sampleTests, ...code.hiddenTests]
  const result = await judgeCode({ code: solution, functionName: code.functionName, tests, timeLimitMs: code.timeLimitMs, memoryMb: code.memoryMb, revealAll: true })
  result.tests = result.tests.map((test) => ({ ...test, kind: test.index < code.sampleTests.length ? 'sample' : 'hidden' }))
  res.json(result)
})

// AI drafts for the teacher to review. Nothing is saved here: the teacher edits a draft and
// saves it through POST / like any other question. Coding drafts are checked by running the
// AI's own reference solution against its tests in the judge.
router.post('/generate', requirePermission('questions.generate'), async (req, res) => {
  const { request, error } = generator.parseRequest(req.body)
  if (error) return res.status(400).json({ error })
  if (!aiConfig().enabled) return res.status(503).json({ error: 'AI question generation is not set up on this server yet. You can still write questions by hand.' })
  if (!(await claimCooldown('generate', req.userId, GENERATE.cooldownMs))) return res.status(429).json({ error: 'Please wait a few seconds before generating again' })
  const over = await spendBudget({ feature: 'generate', userId: req.userId, institutionId: req.institutionId, userLimit: GENERATE.perTeacherPerDay })
  if (over) return res.status(429).json({ error: over === 'user' ? `You've reached today's limit of ${GENERATE.perTeacherPerDay} AI generations.` : "Your institute has reached today's AI limit." })

  const result = await chatJSON({
    messages: generator.buildGeneratorMessages(request),
    validate: (data) => generator.validateGenerated(data, request),
    maxTokens: request.type === 'code' ? 4000 : 2500,
    temperature: 0.7,
    timeoutMs: 60000,
  })
  if (!result.ok) return res.status(502).json({ error: 'The AI could not write valid questions this time. Try again, reword the topic, or write the question by hand.' })

  const drafts = result.data.questions.map((item) => generator.toQuestionBody(item, request))
  if (request.type === 'code') {
    for (const draft of drafts) {
      const { code } = parseQuestionInput(draft).question
      try {
        const checked = await judgeCode({ code: code.referenceSolution, functionName: code.functionName, tests: [...code.sampleTests, ...code.hiddenTests], timeLimitMs: code.timeLimitMs, memoryMb: code.memoryMb })
        draft.check = { verdict: checked.verdict, passed: checked.passed, total: checked.total }
      } catch {
        draft.check = { verdict: 'Not checked', passed: 0, total: 0 }
      }
    }
  }
  res.json({ drafts, model: result.model })
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
