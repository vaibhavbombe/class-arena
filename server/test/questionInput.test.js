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
  assert.match(parseQuestionInput(mcq({ type: 'essay' })).error, /type must be/)
  assert.match(parseQuestionInput(mcq({ difficulty: 'extreme' })).error, /difficulty/)
  assert.match(parseQuestionInput(mcq({ prompt: 'x'.repeat(LIMITS.prompt + 1) })).error, /at most/)
  assert.match(parseQuestionInput(mcq({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).error, /At most 10 tags/)
})

const codeQuestion = (code = {}) => ({
  type: 'code',
  prompt: 'Add two numbers',
  code: {
    functionName: 'solve',
    sampleTests: [{ input: [1, 2], expected: 3 }],
    hiddenTests: [{ input: [10, 5], expected: 15 }, { input: [0, 0], expected: 0 }],
    ...code,
  },
})

test('code question: valid settings get defaults (starter code, limits)', () => {
  const { question, error } = parseQuestionInput(codeQuestion())
  assert.equal(error, undefined)
  assert.equal(question.code.language, 'javascript')
  assert.match(question.code.starterCode, /function solve\(/)
  assert.equal(question.code.timeLimitMs, LIMITS.defaultTimeMs)
  assert.equal(question.code.memoryMb, LIMITS.defaultMemoryMb)
  assert.equal(question.code.hiddenTests.length, 2)
  assert.equal(question.options, undefined)
})

test('code question: expected values may be null, 0, false, strings, arrays or objects', () => {
  const values = [null, 0, false, '', 'text', [1, [2]], { a: { b: 1 } }]
  const { question, error } = parseQuestionInput(codeQuestion({ hiddenTests: values.map((expected, i) => ({ input: [i], expected })) }))
  assert.equal(error, undefined)
  assert.deepEqual(question.code.hiddenTests.map((t) => t.expected), values)
})

test('code question: function name, tests and limits are validated', () => {
  assert.match(parseQuestionInput(codeQuestion({ functionName: 'solve()' })).error, /functionName/)
  assert.match(parseQuestionInput(codeQuestion({ functionName: '1abc' })).error, /functionName/)
  assert.match(parseQuestionInput(codeQuestion({ sampleTests: [] })).error, /between 1 and 10 sample/)
  assert.match(parseQuestionInput(codeQuestion({ hiddenTests: [] })).error, /between 1 and 50 hidden/)
  assert.match(parseQuestionInput(codeQuestion({ sampleTests: [{ input: 5, expected: 5 }] })).error, /list of arguments/)
  assert.match(parseQuestionInput(codeQuestion({ hiddenTests: [{ input: [1] }] })).error, /Hidden test 1: expected value is missing/)
  assert.match(parseQuestionInput(codeQuestion({ timeLimitMs: 60000 })).error, /Time limit/)
  assert.match(parseQuestionInput(codeQuestion({ memoryMb: 1024 })).error, /Memory limit/)
  assert.match(parseQuestionInput(codeQuestion({ hiddenTests: [{ input: ['x'.repeat(20000)], expected: 1 }] })).error, /too large/)
  assert.match(parseQuestionInput({ type: 'code', prompt: 'P' }).error, /code settings are required/)
})

test('code question: test data is stored as plain JSON (no functions or prototypes)', () => {
  const sneaky = { input: [{ toString() { return 'x' } }], expected: { __proto__: { polluted: true }, ok: 1 } }
  const { question } = parseQuestionInput(codeQuestion({ hiddenTests: [sneaky] }))
  assert.deepEqual(question.code.hiddenTests[0], { input: [{}], expected: { ok: 1 } })
  assert.equal({}.polluted, undefined)
})

test('switching a code question to multiple choice drops the code settings', () => {
  const { question } = parseQuestionInput({ ...codeQuestion(), type: 'mcq', options: [{ text: 'a', correct: true }, { text: 'b' }] })
  assert.equal(question.code, undefined)
})
