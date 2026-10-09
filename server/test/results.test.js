const test = require('node:test')
const assert = require('node:assert/strict')
const { canSeeResults, reviewView, summarize } = require('../lib/results')
const { GRACE_MS } = require('../lib/attemptRules')

const items = [
  { type: 'mcq', points: 2, prompt: 'Q1', explanation: 'Because B', options: [{ id: 'a', text: 'A', correct: false }, { id: 'b', text: 'B', correct: true }] },
  { type: 'short', points: 3, prompt: 'Q2', acceptedAnswers: ['Au'], caseSensitive: false },
]
const theTest = { items, closesAt: null, resultsReleasedAt: null }

const attempt = (overrides = {}) => ({
  status: 'submitted',
  score: 2,
  maxScore: 5,
  submittedAt: new Date('2030-01-01T10:00:00Z'),
  submittedBy: 'student',
  questionOrder: [1, 0],
  optionOrders: [['b', 'a'], []],
  answers: [{ selectedOptionIds: ['b'], text: '' }, { selectedOptionIds: [], text: 'Ag' }],
  results: [{ index: 0, correct: true, earned: 2, max: 2 }, { index: 1, correct: false, earned: 0, max: 3 }],
  ...overrides,
})

test('results are hidden until the test closes (plus grace) or the teacher releases them', () => {
  const closesAt = new Date('2030-01-01T12:00:00Z')
  assert.equal(canSeeResults(theTest), false)
  assert.equal(canSeeResults({ ...theTest, closesAt }, new Date(closesAt.getTime() - 1)), false)
  assert.equal(canSeeResults({ ...theTest, closesAt }, new Date(closesAt.getTime() + GRACE_MS - 1)), false)
  assert.equal(canSeeResults({ ...theTest, closesAt }, new Date(closesAt.getTime() + GRACE_MS)), true)
  assert.equal(canSeeResults({ ...theTest, resultsReleasedAt: new Date() }), true)
})

test('reviewView follows the student\'s question and option order and marks answers', () => {
  const review = reviewView(theTest, attempt())
  assert.equal(review.percent, 40)
  assert.deepEqual(review.questions.map((q) => q.prompt), ['Q2', 'Q1'])
  const [short, mcq] = review.questions
  assert.equal(short.yourText, 'Ag')
  assert.deepEqual(short.acceptedAnswers, ['Au'])
  assert.equal(short.correct, false)
  assert.deepEqual(mcq.options.map((o) => [o.id, o.correct, o.selected]), [['b', true, true], ['a', false, false]])
  assert.equal(mcq.explanation, 'Because B')
  assert.equal(mcq.earned, 2)
})

test('summarize computes class statistics from submitted attempts only', () => {
  const stats = summarize(theTest, [
    attempt({ score: 5, results: [{ correct: true }, { correct: true }] }),
    attempt({ score: 2, results: [{ correct: true }, { correct: false }] }),
    attempt({ score: 0, results: [{ correct: false }, { correct: false }] }),
    attempt({ status: 'in_progress', score: null, results: undefined }),
  ])
  assert.equal(stats.submittedCount, 3)
  assert.equal(stats.inProgressCount, 1)
  assert.equal(stats.maxScore, 5)
  assert.equal(stats.average, 2.3)
  assert.equal(stats.averagePercent, 46.7)
  assert.equal(stats.median, 2)
  assert.equal(stats.highest, 5)
  assert.equal(stats.lowest, 0)
  assert.deepEqual(stats.perQuestion.map((q) => q.percentCorrect), [66.7, 33.3])
})

test('summarize with no submissions has empty statistics', () => {
  const stats = summarize(theTest, [])
  assert.equal(stats.average, null)
  assert.equal(stats.median, null)
  assert.equal(stats.perQuestion[0].percentCorrect, null)
})

test('median of an even number of scores is the mean of the middle two', () => {
  const stats = summarize(theTest, [attempt({ score: 1 }), attempt({ score: 4 })])
  assert.equal(stats.median, 2.5)
})
