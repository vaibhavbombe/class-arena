// Pure rules for live quizzes. Unit-tested in test/liveQuizRules.test.js.

const LIMITS = { title: 200, maxItems: 50, minSeconds: 5, maxSeconds: 120 }
const LIVE_TYPES = ['mcq', 'multi'] // typed answers are too slow for a timed game
const DEFAULT_SECONDS = 20

function parseTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return { error: 'title is required' }
  if (title.length > LIMITS.title) return { error: `title can be at most ${LIMITS.title} characters` }
  return { title: title.trim() }
}

// [{ questionId, seconds }] -> validated list.
function parseItems(items) {
  if (!Array.isArray(items)) return { error: 'items must be a list' }
  if (items.length > LIMITS.maxItems) return { error: `A live quiz can have at most ${LIMITS.maxItems} questions` }
  const seen = new Set()
  const parsed = []
  for (const item of items) {
    if (!item || typeof item.questionId !== 'string' || !/^[a-f0-9]{24}$/.test(item.questionId)) return { error: 'Every item needs a valid questionId' }
    if (seen.has(item.questionId)) return { error: 'The same question is in the quiz twice' }
    seen.add(item.questionId)
    const seconds = item.seconds ?? DEFAULT_SECONDS
    if (!Number.isInteger(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds) {
      return { error: `Time per question must be a whole number of seconds from ${LIMITS.minSeconds} to ${LIMITS.maxSeconds}` }
    }
    parsed.push({ questionId: item.questionId, seconds })
  }
  return { items: parsed }
}

// Copies a bank question into the quiz (answers included: needed for scoring, staff-only).
function snapshotOf(question, seconds) {
  if (!LIVE_TYPES.includes(question.type)) {
    return { error: 'Live quizzes support multiple choice and multi-select questions only' }
  }
  return {
    item: {
      questionId: question._id,
      seconds,
      type: question.type,
      prompt: question.prompt,
      options: question.options.map(({ id, text, correct }) => ({ id, text, correct })),
      explanation: question.explanation || '',
    },
  }
}

function summary(quiz) {
  return {
    id: quiz._id,
    classId: quiz.classId,
    title: quiz.title,
    questionCount: quiz.items.length,
    totalSeconds: quiz.items.reduce((sum, item) => sum + item.seconds, 0),
    updatedAt: quiz.updatedAt,
  }
}

function detail(quiz) {
  return { ...summary(quiz), items: quiz.items.map((item) => (item.toObject ? item.toObject() : item)) }
}

module.exports = { LIMITS, LIVE_TYPES, DEFAULT_SECONDS, parseTitle, parseItems, snapshotOf, summary, detail }
