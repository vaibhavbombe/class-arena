const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../lib/attemptRules')

const MIN = 60 * 1000
const sampleTest = (overrides = {}) => ({
  _id: 't1',
  title: 'Quiz',
  instructions: '',
  durationMinutes: 30,
  closesAt: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  items: [
    { type: 'mcq', points: 1, prompt: 'Q1', options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: false }], explanation: 'SECRET-EXPLANATION' },
    { type: 'multi', points: 2, prompt: 'Q2', options: [{ id: 'c', text: 'C', correct: true }, { id: 'd', text: 'D', correct: true }, { id: 'e', text: 'E', correct: false }] },
    { type: 'short', points: 3, prompt: 'Q3', acceptedAnswers: ['SECRET-ANSWER'], caseSensitive: false },
  ],
  ...overrides,
})

test('deadline is start + duration, capped at the closing time', () => {
  const start = new Date('2030-01-01T10:00:00Z')
  assert.equal(rules.deadlineFor(sampleTest(), start).toISOString(), '2030-01-01T10:30:00.000Z')
  const closesSoon = sampleTest({ closesAt: new Date('2030-01-01T10:10:00Z') })
  assert.equal(rules.deadlineFor(closesSoon, start).toISOString(), '2030-01-01T10:10:00.000Z')
})

test('the grace period applies after the deadline', () => {
  const deadline = new Date('2030-01-01T10:30:00Z')
  assert.equal(rules.isPastDeadline({ deadline }, new Date(deadline.getTime() + rules.GRACE_MS)), false)
  assert.equal(rules.isPastDeadline({ deadline }, new Date(deadline.getTime() + rules.GRACE_MS + 1)), true)
})

test('layout keeps order without shuffling and permutes it with shuffling', () => {
  const plain = rules.layoutFor(sampleTest())
  assert.deepEqual(plain.questionOrder, [0, 1, 2])
  assert.deepEqual(plain.optionOrders, [['a', 'b'], ['c', 'd', 'e'], []])

  const big = sampleTest({ shuffleQuestions: true, shuffleOptions: true, items: Array.from({ length: 30 }, (_, i) => ({ type: 'mcq', options: [{ id: `x${i}` }, { id: `y${i}` }] })) })
  const layout = rules.layoutFor(big)
  assert.deepEqual([...layout.questionOrder].sort((a, b) => a - b), big.items.map((_, i) => i))
  assert.notDeepEqual(layout.questionOrder, big.items.map((_, i) => i)) // 1 in 30! chance of a false failure
})

test('parseAnswer validates against the question', () => {
  const [mcq, multi, short] = sampleTest().items
  assert.deepEqual(rules.parseAnswer(mcq, { selectedOptionIds: ['a'] }).answer, { selectedOptionIds: ['a'], text: '' })
  assert.match(rules.parseAnswer(mcq, { selectedOptionIds: ['a', 'b'] }).error, /only one/)
  assert.match(rules.parseAnswer(mcq, { selectedOptionIds: ['zzz'] }).error, /Unknown option/)
  assert.match(rules.parseAnswer(mcq, { selectedOptionIds: [{ $ne: 1 }] }).error, /list/)
  assert.deepEqual(rules.parseAnswer(multi, { selectedOptionIds: ['c', 'd', 'c'] }).answer.selectedOptionIds, ['c', 'd'])
  assert.deepEqual(rules.parseAnswer(short, { text: 'hello' }).answer, { selectedOptionIds: [], text: 'hello' })
  assert.match(rules.parseAnswer(short, { text: 'x'.repeat(rules.MAX_TEXT + 1) }).error, /at most/)
  assert.match(rules.parseAnswer(short, { text: 5 }).error, /text/)
})

test('parseAnswerBatch checks indexes', () => {
  const t = sampleTest()
  assert.equal(rules.parseAnswerBatch(t, [{ index: 2, text: 'x' }]).updates.get(2).text, 'x')
  assert.match(rules.parseAnswerBatch(t, [{ index: 3, text: 'x' }]).error, /out of range/)
  assert.match(rules.parseAnswerBatch(t, [{ index: '0', text: 'x' }]).error, /out of range/)
  assert.match(rules.parseAnswerBatch(t, 'nope').error, /list/)
})

test('the student view never contains correct answers or explanations', () => {
  const t = sampleTest({ shuffleOptions: true })
  const layout = rules.layoutFor(t)
  const attempt = { _id: 'a1', status: 'in_progress', startedAt: new Date(), deadline: new Date(Date.now() + 30 * MIN), answers: rules.emptyAnswers(t), ...layout }
  const view = rules.studentAttemptView(t, attempt)
  assert.equal(view.questions.length, 3)
  assert.deepEqual(view.questions[1].options.map((o) => o.id).sort(), ['c', 'd', 'e'])
  const json = JSON.stringify(view)
  for (const leaked of ['correct', 'SECRET-ANSWER', 'SECRET-EXPLANATION', 'acceptedAnswers', 'explanation']) {
    assert.ok(!json.includes(leaked), `student view leaked ${leaked}`)
  }
})

test('a submitted attempt shows no questions', () => {
  const t = sampleTest()
  const view = rules.studentAttemptView(t, { _id: 'a1', status: 'submitted', startedAt: new Date(), deadline: new Date(), submittedAt: new Date(), answers: [] })
  assert.equal(view.questions, undefined)
})
