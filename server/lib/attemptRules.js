const crypto = require('crypto')

// Pure rules for test attempts. Unit-tested in test/attemptRules.test.js.

// Saves and submits that arrive a few seconds late (network delay) still count.
const GRACE_MS = 5000
const MAX_TEXT = 1000

// Fisher–Yates with a cryptographic random source, so the order can't be predicted.
function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// The student's deadline: their full duration from starting, but never past the closing time.
function deadlineFor(test, startedAt) {
  const byDuration = new Date(startedAt.getTime() + test.durationMinutes * 60 * 1000)
  return test.closesAt && test.closesAt < byDuration ? new Date(test.closesAt) : byDuration
}

// Question order and option order for one student, stored on the attempt so a reload
// shows the same order.
function layoutFor(test) {
  const indexes = test.items.map((_, index) => index)
  return {
    questionOrder: test.shuffleQuestions ? shuffled(indexes) : indexes,
    optionOrders: test.items.map((item) => {
      const ids = (item.options || []).map((option) => option.id)
      return test.shuffleOptions ? shuffled(ids) : ids
    }),
  }
}

function emptyAnswers(test) {
  return test.items.map(() => ({ selectedOptionIds: [], text: '' }))
}

function isPastDeadline(attempt, now = new Date()) {
  return now.getTime() > attempt.deadline.getTime() + GRACE_MS
}

// Validates one answer from the student against the question it's for.
function parseAnswer(item, answer) {
  if (!answer || typeof answer !== 'object') return { error: 'Each answer must be an object' }
  if (item.type === 'short') {
    if (typeof answer.text !== 'string') return { error: 'A short answer must be text' }
    if (answer.text.length > MAX_TEXT) return { error: `Answers can be at most ${MAX_TEXT} characters` }
    return { answer: { selectedOptionIds: [], text: answer.text } }
  }
  const ids = answer.selectedOptionIds
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return { error: 'selectedOptionIds must be a list' }
  const valid = new Set(item.options.map((option) => option.id))
  if (!ids.every((id) => valid.has(id))) return { error: 'Unknown option selected' }
  const unique = [...new Set(ids)]
  if (item.type === 'mcq' && unique.length > 1) return { error: 'Pick only one option' }
  return { answer: { selectedOptionIds: unique, text: '' } }
}

// Validates a batch like [{ index, selectedOptionIds | text }]. Returns { updates: Map(index -> answer) }.
function parseAnswerBatch(test, batch) {
  if (!Array.isArray(batch)) return { error: 'answers must be a list' }
  if (batch.length > test.items.length) return { error: 'Too many answers' }
  const updates = new Map()
  for (const entry of batch) {
    const index = entry?.index
    if (!Number.isInteger(index) || index < 0 || index >= test.items.length) return { error: 'Answer index out of range' }
    const { answer, error } = parseAnswer(test.items[index], entry)
    if (error) return { error }
    updates.set(index, answer)
  }
  return { updates }
}

// What the student sees while taking the test: questions in their order, options in
// their order, their saved answers. No correct flags, accepted answers or explanations.
function studentAttemptView(test, attempt, now = new Date()) {
  const base = {
    id: attempt._id,
    testId: test._id,
    title: test.title,
    instructions: test.instructions,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    submittedAt: attempt.submittedAt,
    submittedBy: attempt.submittedBy,
    serverNow: now, // lets the browser correct for its own clock being off
    totalPoints: test.items.reduce((sum, item) => sum + item.points, 0),
  }
  if (attempt.status !== 'in_progress') return base

  return {
    ...base,
    questions: attempt.questionOrder.map((index, position) => {
      const item = test.items[index]
      const optionsById = new Map((item.options || []).map((option) => [option.id, option]))
      return {
        index,
        number: position + 1,
        type: item.type,
        prompt: item.prompt,
        points: item.points,
        ...(item.type !== 'short' && {
          options: attempt.optionOrders[index].map((id) => ({ id, text: optionsById.get(id).text })),
        }),
        answer: attempt.answers[index],
      }
    }),
  }
}

module.exports = {
  GRACE_MS,
  MAX_TEXT,
  shuffled,
  deadlineFor,
  layoutFor,
  emptyAnswers,
  isPastDeadline,
  parseAnswer,
  parseAnswerBatch,
  studentAttemptView,
}
