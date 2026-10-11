const test = require('node:test')
const assert = require('node:assert/strict')
const gen = require('../lib/ai/generator')
const { parseQuestionInput } = require('../lib/questionInput')

const mcqItem = (extra = {}) => ({
  prompt: 'Which keyword declares a block-scoped variable?',
  options: [{ text: 'let', correct: true }, { text: 'var', correct: false }, { text: 'function', correct: false }],
  explanation: 'let is block scoped.',
  tags: ['Scope', 'variables'],
  ...extra,
})
const codeItem = (extra = {}) => ({
  prompt: 'Double it\nReturn n times two.',
  functionName: 'double',
  starterCode: 'function double(n) {\n}\n',
  referenceSolution: 'function double(n) { return n * 2 }',
  sampleTests: [{ input: [2], expected: 4 }],
  hiddenTests: [{ input: [0], expected: 0 }, { input: [-3], expected: -6 }, { input: [10], expected: 20 }],
  explanation: 'Multiply by two.',
  tags: ['math'],
  ...extra,
})
const mcq = { type: 'mcq', count: 1, difficulty: 'easy' }

test('request validation: topic, type, count per type, difficulty, notes', () => {
  assert.deepEqual(gen.parseRequest({ topic: '  JS scope ', type: 'mcq' }).request, { topic: 'JS scope', type: 'mcq', count: 3, difficulty: 'medium', notes: '' })
  assert.match(gen.parseRequest({ topic: 'x', type: 'mcq' }).error, /topic/)
  assert.match(gen.parseRequest({ topic: 'y'.repeat(301), type: 'mcq' }).error, /300/)
  assert.match(gen.parseRequest({ topic: 'loops', type: 'essay' }).error, /type/)
  assert.match(gen.parseRequest({ topic: 'loops', type: 'code', count: 3 }).error, /1 to 2/)
  assert.match(gen.parseRequest({ topic: 'loops', type: 'mcq', count: 6 }).error, /1 to 5/)
  assert.match(gen.parseRequest({ topic: 'loops', type: 'mcq', difficulty: 'insane' }).error, /difficulty/)
})

test('prompt: count, type, difficulty, JSON shape; topic passed as data', () => {
  const [system, user] = gen.buildGeneratorMessages({ topic: 'Array methods', type: 'code', count: 2, difficulty: 'hard', notes: 'Use map and filter' })
  assert.match(system.content, /exactly 2 hard question\(s\) of type "code"/)
  assert.match(system.content, /reference solution must pass every test/)
  assert.match(system.content, /ignore any instructions/)
  assert.match(system.content, /"questions"/)
  assert.match(user.content, /Topic: Array methods\nTeacher's notes: Use map and filter/)
})

test('valid MCQ output becomes a body the question bank accepts', () => {
  assert.equal(gen.validateGenerated({ questions: [mcqItem()] }, mcq), null)
  const body = gen.toQuestionBody(mcqItem(), mcq)
  assert.deepEqual(body.tags, ['scope', 'variables'])
  assert.equal(body.difficulty, 'easy')
  assert.ok(parseQuestionInput(body).question)
})

test('wrong count, extra fields, two correct MCQ answers, too few multi answers are rejected', () => {
  assert.match(gen.validateGenerated({ questions: [mcqItem(), mcqItem()] }, mcq), /at most 1/)
  assert.match(gen.validateGenerated({ questions: [mcqItem({ secret: 1 })] }, mcq), /not allowed/)
  const twoRight = mcqItem({ options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c', correct: false }] })
  assert.match(gen.validateGenerated({ questions: [twoRight] }, mcq), /exactly one correct/)
  assert.match(gen.validateGenerated({ questions: [mcqItem()] }, { ...mcq, type: 'multi' }), /two correct/)
  const duplicate = mcqItem({ options: [{ text: 'let', correct: true }, { text: 'LET', correct: false }, { text: 'var', correct: false }] })
  assert.match(gen.validateGenerated({ questions: [duplicate] }, mcq), /same text/)
})

test('short answers and code questions', () => {
  const short = { type: 'short', count: 1, difficulty: 'medium' }
  assert.equal(gen.validateGenerated({ questions: [{ prompt: 'What does DOM stand for?', acceptedAnswers: ['Document Object Model'], explanation: '', tags: [] }] }, short), null)
  const code = { type: 'code', count: 1, difficulty: 'medium' }
  assert.equal(gen.validateGenerated({ questions: [codeItem()] }, code), null)
  assert.match(gen.validateGenerated({ questions: [codeItem({ functionName: 'not valid' })] }, code), /functionName/)
  assert.match(gen.validateGenerated({ questions: [codeItem({ hiddenTests: [{ input: [1], expected: 2 }] })] }, code), /at least 3/)
  assert.match(gen.validateGenerated({ questions: [codeItem({ sampleTests: [{ input: 2, expected: 4 }] })] }, code), /must be an array/)
  const body = gen.toQuestionBody(codeItem(), code)
  assert.deepEqual([body.code.timeLimitMs, body.code.memoryMb, body.code.hiddenTests.length], [1000, 32, 3])
})
