const test = require('node:test')
const assert = require('node:assert/strict')
const { parseQuestionInput, LIMITS } = require('../lib/questionInput')

const mcq = (overrides = {}) => ({
  type: 'mcq',
  prompt: 'What is 2 + 2?',
  options: [{ text: '3' }, { text: '4', correct: true }, { text: '5' }],
  ...overrides,
})

test('accepts a valid multiple choice question and assigns option ids', () => {
  const { question, error } = parseQuestionInput(mcq({ tags: [' Maths ', 'maths', 'Basic Arithmetic'] }))
  assert.equal(error, undefined)
  assert.equal(question.options.length, 3)
  assert.ok(question.options.every((option) => /^[a-f0-9]{8}$/.test(option.id)))
  assert.equal(new Set(question.options.map((option) => option.id)).size, 3)
  assert.deepEqual(question.options.map((option) => option.correct), [false, true, false])
  assert.deepEqual(question.tags, ['maths', 'basic-arithmetic'])
  assert.equal(question.acceptedAnswers, undefined)
})

test('ignores option ids sent by the client', () => {
  const { question } = parseQuestionInput(mcq({ options: [{ id: 'aaa', text: 'x', correct: true }, { id: 'aaa', text: 'y' }] }))
  assert.notEqual(question.options[0].id, 'aaa')
  assert.notEqual(question.options[0].id, question.options[1].id)
})

test('multiple choice needs exactly one correct option', () => {
  assert.match(parseQuestionInput(mcq({ options: [{ text: 'a' }, { text: 'b' }] })).error, /exactly one/)
  assert.match(parseQuestionInput(mcq({ options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] })).error, /exactly one/)
})

test('multi-select needs at least one correct option and allows several', () => {
  assert.match(parseQuestionInput({ ...mcq(), type: 'multi', options: [{ text: 'a' }, { text: 'b' }] }).error, /at least one/)
  const { question } = parseQuestionInput({ ...mcq(), type: 'multi', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }] })
  assert.equal(question.options.filter((option) => option.correct).length, 2)
})

test('rejects too few, too many, empty or duplicate options', () => {
  assert.match(parseQuestionInput(mcq({ options: [{ text: 'only', correct: true }] })).error, /between 2 and 8/)
  const nine = Array.from({ length: 9 }, (_, i) => ({ text: `o${i}`, correct: i === 0 }))
  assert.match(parseQuestionInput(mcq({ options: nine })).error, /between 2 and 8/)
  assert.match(parseQuestionInput(mcq({ options: [{ text: ' ', correct: true }, { text: 'b' }] })).error, /needs text/)
  assert.match(parseQuestionInput(mcq({ options: [{ text: 'Same', correct: true }, { text: 'same' }] })).error, /same text/)
})

test('rejects non-boolean correct flags and non-string fields (no operator injection)', () => {
  assert.match(parseQuestionInput(mcq({ options: [{ text: 'a', correct: 'yes' }, { text: 'b' }] })).error, /true or false/)
  assert.match(parseQuestionInput(mcq({ prompt: { $ne: '' } })).error, /prompt is required/)
  assert.match(parseQuestionInput(mcq({ tags: [{ $gt: '' }] })).error, /tags/)
})

test('short answer: normalises and de-duplicates accepted answers', () => {
  const { question, error } = parseQuestionInput({ type: 'short', prompt: 'Capital of France?', acceptedAnswers: ['  Paris ', 'paris', 'Paris', 'City  of   Light'] })
  assert.equal(error, undefined)
  assert.deepEqual(question.acceptedAnswers, ['Paris', 'paris', 'City of Light'])
  assert.equal(question.options, undefined)
  assert.equal(question.caseSensitive, false)
})

test('short answer needs at least one answer', () => {
  assert.match(parseQuestionInput({ type: 'short', prompt: 'Q?', acceptedAnswers: [' '] }).error, /at least one/)
  assert.match(parseQuestionInput({ type: 'short', prompt: 'Q?' }).error, /acceptedAnswers/)
})

test('changing type drops fields from the old type', () => {
  const { question } = parseQuestionInput({ type: 'short', prompt: 'Q?', acceptedAnswers: ['a'], options: [{ text: 'x', correct: true }, { text: 'y' }] })
  assert.equal(question.options, undefined)
  const asMcq = parseQuestionInput(mcq({ acceptedAnswers: ['a'], caseSensitive: true })).question
  assert.equal(asMcq.acceptedAnswers, undefined)
  assert.equal(asMcq.caseSensitive, false)
})

test('enforces type, difficulty and length limits', () => {
  assert.match(parseQuestionInput(mcq({ type: 'code' })).error, /type must be/)
  assert.match(parseQuestionInput(mcq({ difficulty: 'extreme' })).error, /difficulty/)
  assert.match(parseQuestionInput(mcq({ prompt: 'x'.repeat(LIMITS.prompt + 1) })).error, /at most/)
  assert.match(parseQuestionInput(mcq({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).error, /At most 10 tags/)
})
