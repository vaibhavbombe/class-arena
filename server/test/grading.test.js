const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeText, isCorrect, gradeAttempt } = require('../lib/grading')

const mcq = { type: 'mcq', points: 2, options: [{ id: 'a', correct: false }, { id: 'b', correct: true }, { id: 'c', correct: false }] }
const multi = { type: 'multi', points: 3, options: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c', correct: false }] }
const short = { type: 'short', points: 1, acceptedAnswers: ['Paris', 'City of Light'], caseSensitive: false }

test('normalizeText trims, collapses spaces and lowercases unless case sensitive', () => {
  assert.equal(normalizeText('  New   York ', false), 'new york')
  assert.equal(normalizeText('  New   York ', true), 'New York')
  assert.equal(normalizeText(undefined, false), '')
})

test('multiple choice: only the single correct option scores', () => {
  assert.equal(isCorrect(mcq, { selectedOptionIds: ['b'] }), true)
  assert.equal(isCorrect(mcq, { selectedOptionIds: ['a'] }), false)
  assert.equal(isCorrect(mcq, { selectedOptionIds: ['b', 'a'] }), false)
  assert.equal(isCorrect(mcq, { selectedOptionIds: [] }), false)
  assert.equal(isCorrect(mcq, undefined), false)
})

test('multi-select is all-or-nothing on the exact set', () => {
  assert.equal(isCorrect(multi, { selectedOptionIds: ['b', 'a'] }), true)
  assert.equal(isCorrect(multi, { selectedOptionIds: ['a'] }), false)
  assert.equal(isCorrect(multi, { selectedOptionIds: ['a', 'b', 'c'] }), false)
  assert.equal(isCorrect(multi, { selectedOptionIds: [] }), false)
})

test('short answer matches any accepted answer after normalising', () => {
  assert.equal(isCorrect(short, { text: ' paris ' }), true)
  assert.equal(isCorrect(short, { text: 'city  of LIGHT' }), true)
  assert.equal(isCorrect(short, { text: 'Lyon' }), false)
  assert.equal(isCorrect(short, { text: '   ' }), false)
  const strict = { ...short, caseSensitive: true }
  assert.equal(isCorrect(strict, { text: 'paris' }), false)
  assert.equal(isCorrect(strict, { text: 'Paris' }), true)
})

test('gradeAttempt totals points per question', () => {
  const { score, maxScore, results } = gradeAttempt([mcq, multi, short], [
    { selectedOptionIds: ['b'] },
    { selectedOptionIds: ['a'] },
    { text: 'Paris' },
  ])
  assert.equal(score, 3)
  assert.equal(maxScore, 6)
  assert.deepEqual(results.map((r) => r.earned), [2, 0, 1])
})

test('gradeAttempt treats missing answers as wrong', () => {
  assert.equal(gradeAttempt([mcq, short], []).score, 0)
})
