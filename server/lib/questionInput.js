const crypto = require('crypto')

// Turns a request body into a clean question document, or explains what's wrong.
// Pure function (no database), so it's unit-tested in test/questionInput.test.js.

const TYPES = ['mcq', 'multi', 'short', 'code']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const LIMITS = {
  prompt: 5000,
  explanation: 5000,
  optionText: 500,
  minOptions: 2,
  maxOptions: 8,
  answerText: 200,
  maxAnswers: 10,
  tag: 30,
  maxTags: 10,
  // Coding questions (limits match the judge's caps in judge/runner.js)
  starterCode: 10000,
  referenceSolution: 50000,
  testJson: 10000, // characters of JSON per test input or expected value
  minSampleTests: 1,
  maxSampleTests: 10,
  minHiddenTests: 1,
  maxHiddenTests: 50,
  minTimeMs: 100,
  maxTimeMs: 5000,
  defaultTimeMs: 1000,
  minMemoryMb: 16,
  maxMemoryMb: 128,
  defaultMemoryMb: 32,
}

const isString = (value) => typeof value === 'string'

function cleanTags(tags) {
  if (tags === undefined) return { tags: [] }
  if (!Array.isArray(tags) || !tags.every(isString)) return { error: 'tags must be a list of words' }
  const cleaned = [...new Set(tags.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))]
  if (cleaned.length > LIMITS.maxTags) return { error: `At most ${LIMITS.maxTags} tags` }
  if (cleaned.some((tag) => tag.length > LIMITS.tag)) return { error: `Tags can be at most ${LIMITS.tag} characters` }
  return { tags: cleaned }
}

function cleanOptions(type, options) {
  if (!Array.isArray(options)) return { error: 'options are required for this question type' }
  if (options.length < LIMITS.minOptions || options.length > LIMITS.maxOptions) {
    return { error: `Give between ${LIMITS.minOptions} and ${LIMITS.maxOptions} options` }
  }
  const cleaned = []
  for (const option of options) {
    if (!option || !isString(option.text) || !option.text.trim()) return { error: 'Every option needs text' }
    if (option.text.length > LIMITS.optionText) return { error: `Options can be at most ${LIMITS.optionText} characters` }
    if (option.correct !== undefined && typeof option.correct !== 'boolean') return { error: 'option.correct must be true or false' }
    // Ids come from the server, so a client can't plant duplicates or guessable ids.
    cleaned.push({ id: crypto.randomBytes(4).toString('hex'), text: option.text.trim(), correct: option.correct === true })
  }
  const texts = cleaned.map((option) => option.text.toLowerCase())
  if (new Set(texts).size !== texts.length) return { error: 'Two options have the same text' }

  const correctCount = cleaned.filter((option) => option.correct).length
  if (type === 'mcq' && correctCount !== 1) return { error: 'A multiple choice question needs exactly one correct option' }
  if (type === 'multi' && correctCount < 1) return { error: 'Mark at least one option as correct' }
  return { options: cleaned }
}

function cleanAcceptedAnswers(answers) {
  if (!Array.isArray(answers) || !answers.every(isString)) return { error: 'acceptedAnswers must be a list of answers' }
  const cleaned = [...new Set(answers.map((answer) => answer.trim().replace(/\s+/g, ' ')).filter(Boolean))]
  if (!cleaned.length) return { error: 'Give at least one accepted answer' }
  if (cleaned.length > LIMITS.maxAnswers) return { error: `At most ${LIMITS.maxAnswers} accepted answers` }
  if (cleaned.some((answer) => answer.length > LIMITS.answerText)) return { error: `Answers can be at most ${LIMITS.answerText} characters` }
  return { acceptedAnswers: cleaned }
}

// One test case: input is the argument list (solve(...input)), expected any JSON value.
function cleanTest(test, label) {
  if (!test || typeof test !== 'object') return { error: `${label}: each test needs an input and an expected value` }
  if (!Array.isArray(test.input)) return { error: `${label}: input must be a list of arguments, e.g. [2, 3]` }
  if (test.expected === undefined) return { error: `${label}: expected value is missing` }
  const input = JSON.stringify(test.input)
  const expected = JSON.stringify(test.expected)
  if (input.length > LIMITS.testJson || expected.length > LIMITS.testJson) return { error: `${label}: test data is too large` }
  // Round-trip through JSON so only plain data (no functions, no prototypes) is stored.
  return { test: { input: JSON.parse(input), expected: JSON.parse(expected) } }
}

function cleanTests(tests, kind, min, max) {
  if (!Array.isArray(tests) || tests.length < min || tests.length > max) {
    return { error: `Give between ${min} and ${max} ${kind} tests` }
  }
  const cleaned = []
  for (const [i, test] of tests.entries()) {
    const result = cleanTest(test, `${kind[0].toUpperCase()}${kind.slice(1)} test ${i + 1}`)
    if (result.error) return result
    cleaned.push(result.test)
  }
  return { tests: cleaned }
}

function cleanCode(code) {
  if (!code || typeof code !== 'object') return { error: 'code settings are required for a coding question' }
  const { functionName, starterCode = '', referenceSolution = '', timeLimitMs = LIMITS.defaultTimeMs, memoryMb = LIMITS.defaultMemoryMb } = code
  if (!isString(functionName) || !/^[A-Za-z_$][\w$]{0,63}$/.test(functionName)) return { error: 'functionName must be a valid JavaScript name, e.g. solve' }
  if (!isString(starterCode) || starterCode.length > LIMITS.starterCode) return { error: `Starter code can be at most ${LIMITS.starterCode} characters` }
  if (!isString(referenceSolution) || referenceSolution.length > LIMITS.referenceSolution) return { error: `The reference solution can be at most ${LIMITS.referenceSolution} characters` }
  if (!Number.isInteger(timeLimitMs) || timeLimitMs < LIMITS.minTimeMs || timeLimitMs > LIMITS.maxTimeMs) return { error: `Time limit must be ${LIMITS.minTimeMs}-${LIMITS.maxTimeMs} ms` }
  if (!Number.isInteger(memoryMb) || memoryMb < LIMITS.minMemoryMb || memoryMb > LIMITS.maxMemoryMb) return { error: `Memory limit must be ${LIMITS.minMemoryMb}-${LIMITS.maxMemoryMb} MB` }
  const samples = cleanTests(code.sampleTests, 'sample', LIMITS.minSampleTests, LIMITS.maxSampleTests)
  if (samples.error) return samples
  const hidden = cleanTests(code.hiddenTests, 'hidden', LIMITS.minHiddenTests, LIMITS.maxHiddenTests)
  if (hidden.error) return hidden
  return {
    code: {
      language: 'javascript',
      functionName,
      starterCode: starterCode || `function ${functionName}() {\n  \n}\n`,
      referenceSolution,
      sampleTests: samples.tests,
      hiddenTests: hidden.tests,
      timeLimitMs,
      memoryMb,
    },
  }
}

function parseQuestionInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body is required' }
  const { type, prompt, explanation = '', difficulty = 'medium', caseSensitive = false } = body

  if (!TYPES.includes(type)) return { error: `type must be one of: ${TYPES.join(', ')}` }
  if (!isString(prompt) || !prompt.trim()) return { error: 'prompt is required' }
  if (prompt.length > LIMITS.prompt) return { error: `prompt can be at most ${LIMITS.prompt} characters` }
  if (!isString(explanation) || explanation.length > LIMITS.explanation) return { error: `explanation can be at most ${LIMITS.explanation} characters` }
  if (!DIFFICULTIES.includes(difficulty)) return { error: `difficulty must be one of: ${DIFFICULTIES.join(', ')}` }
  if (typeof caseSensitive !== 'boolean') return { error: 'caseSensitive must be true or false' }

  const tagResult = cleanTags(body.tags)
  if (tagResult.error) return tagResult

  const question = {
    type,
    prompt: prompt.trim(),
    explanation: explanation.trim(),
    difficulty,
    tags: tagResult.tags,
    // Unset fields that don't belong to this type, so a type change leaves nothing behind.
    options: undefined,
    acceptedAnswers: undefined,
    caseSensitive: false,
    code: undefined,
  }

  if (type === 'code') {
    const codeResult = cleanCode(body.code)
    if (codeResult.error) return codeResult
    question.code = codeResult.code
  } else if (type === 'short') {
    const answerResult = cleanAcceptedAnswers(body.acceptedAnswers)
    if (answerResult.error) return answerResult
    question.acceptedAnswers = answerResult.acceptedAnswers
    question.caseSensitive = caseSensitive
  } else {
    const optionResult = cleanOptions(type, body.options)
    if (optionResult.error) return optionResult
    question.options = optionResult.options
  }

  return { question }
}

module.exports = { parseQuestionInput, cleanTest, cleanCode, LIMITS }
