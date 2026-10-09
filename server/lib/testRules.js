// Pure rules for tests (no database): input validation, open/closed status and the
// shapes sent to staff and students. Unit-tested in test/testRules.test.js.

const LIMITS = { title: 200, instructions: 5000, minMinutes: 1, maxMinutes: 600, maxItems: 100, minPoints: 1, maxPoints: 100 }
const SETTINGS = ['title', 'instructions', 'durationMinutes', 'opensAt', 'closesAt', 'shuffleQuestions', 'shuffleOptions']
// What may still change once students can see the test.
const EDITABLE_AFTER_PUBLISH = ['title', 'instructions', 'closesAt']

function parseDate(value, field) {
  if (value === null || value === '') return { value: null }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return { error: `${field} must be a date` }
  return { value: new Date(value) }
}

// Validates the settings present in `body` (others are left alone).
// `current` is the saved test, so a change to one date is checked against the other.
function parseSettings(body, current = {}) {
  const changes = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'title is required' }
    if (body.title.length > LIMITS.title) return { error: `title can be at most ${LIMITS.title} characters` }
    changes.title = body.title.trim()
  }
  if ('instructions' in body) {
    if (typeof body.instructions !== 'string' || body.instructions.length > LIMITS.instructions) {
      return { error: `instructions can be at most ${LIMITS.instructions} characters` }
    }
    changes.instructions = body.instructions.trim()
  }
  if ('durationMinutes' in body) {
    const minutes = body.durationMinutes
    if (!Number.isInteger(minutes) || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes) {
      return { error: `durationMinutes must be a whole number from ${LIMITS.minMinutes} to ${LIMITS.maxMinutes}` }
    }
    changes.durationMinutes = minutes
  }
  for (const field of ['opensAt', 'closesAt']) {
    if (field in body) {
      const { value, error } = parseDate(body[field], field)
      if (error) return { error }
      changes[field] = value
    }
  }
  for (const field of ['shuffleQuestions', 'shuffleOptions']) {
    if (field in body) {
      if (typeof body[field] !== 'boolean') return { error: `${field} must be true or false` }
      changes[field] = body[field]
    }
  }

  const opensAt = 'opensAt' in changes ? changes.opensAt : current.opensAt
  const closesAt = 'closesAt' in changes ? changes.closesAt : current.closesAt
  if (opensAt && closesAt && opensAt >= closesAt) return { error: 'The closing time must be after the opening time' }
  return { changes }
}

// Validates the list of { questionId, points } a teacher picked.
function parseItems(items) {
  if (!Array.isArray(items)) return { error: 'items must be a list' }
  if (items.length > LIMITS.maxItems) return { error: `A test can have at most ${LIMITS.maxItems} questions` }
  const seen = new Set()
  const parsed = []
  for (const item of items) {
    if (!item || typeof item.questionId !== 'string' || !/^[a-f0-9]{24}$/.test(item.questionId)) return { error: 'Every item needs a valid questionId' }
    if (seen.has(item.questionId)) return { error: 'The same question is in the test twice' }
    seen.add(item.questionId)
    if (!Number.isInteger(item.points) || item.points < LIMITS.minPoints || item.points > LIMITS.maxPoints) {
      return { error: `Points must be a whole number from ${LIMITS.minPoints} to ${LIMITS.maxPoints}` }
    }
    parsed.push({ questionId: item.questionId, points: item.points })
  }
  return { items: parsed }
}

// For a published test, only some settings may change.
function lockedFieldsIn(body) {
  return [...SETTINGS.filter((field) => !EDITABLE_AFTER_PUBLISH.includes(field)), 'items'].filter((field) => field in body)
}

// Copies the parts of a bank question a test needs, including the answers
// (needed for grading; never sent to students).
function snapshotOf(question, points) {
  return {
    questionId: question._id,
    points,
    type: question.type,
    prompt: question.prompt,
    options: question.options?.map(({ id, text, correct }) => ({ id, text, correct })),
    acceptedAnswers: question.acceptedAnswers ? [...question.acceptedAnswers] : undefined,
    caseSensitive: question.caseSensitive || false,
    explanation: question.explanation || '',
  }
}

// What students and teachers see as the test's state. Decided on the server's clock.
function testStatus(test, now = new Date()) {
  if (test.status !== 'published') return 'draft'
  if (test.opensAt && now < test.opensAt) return 'upcoming'
  if (test.closesAt && now >= test.closesAt) return 'closed'
  return 'open'
}

// Problems that block publishing, or null.
function publishProblem(test, now = new Date()) {
  if (!test.items.length) return 'Add at least one question before publishing'
  if (test.closesAt && test.closesAt <= now) return 'The closing time has already passed'
  return null
}

function totals(test) {
  return { questionCount: test.items.length, totalPoints: test.items.reduce((sum, item) => sum + item.points, 0) }
}

function staffSummary(test, now) {
  return {
    id: test._id,
    classId: test.classId,
    title: test.title,
    status: testStatus(test, now),
    durationMinutes: test.durationMinutes,
    opensAt: test.opensAt,
    closesAt: test.closesAt,
    publishedAt: test.publishedAt,
    updatedAt: test.updatedAt,
    ...totals(test),
  }
}

// Staff get everything, including correct answers.
function staffDetail(test, now) {
  return {
    ...staffSummary(test, now),
    instructions: test.instructions,
    shuffleQuestions: test.shuffleQuestions,
    shuffleOptions: test.shuffleOptions,
    items: test.items.map((item) => (item.toObject ? item.toObject() : item)),
  }
}

// Before starting, a student sees the outline only: no question text, no answers.
function studentOutline(test, now) {
  return {
    id: test._id,
    classId: test.classId,
    title: test.title,
    instructions: test.instructions,
    status: testStatus(test, now),
    durationMinutes: test.durationMinutes,
    opensAt: test.opensAt,
    closesAt: test.closesAt,
    ...totals(test),
  }
}

module.exports = {
  LIMITS,
  parseSettings,
  parseItems,
  lockedFieldsIn,
  snapshotOf,
  testStatus,
  publishProblem,
  staffSummary,
  staffDetail,
  studentOutline,
}
