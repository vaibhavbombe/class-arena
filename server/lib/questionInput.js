const crypto = require('crypto')

// Turns a request body into a clean question document, or explains what's wrong.
// Pure function (no database), so it's unit-tested in test/questionInput.test.js.

const TYPES = ['mcq', 'multi', 'short']
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
  }

  if (type === 'short') {
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

module.exports = { parseQuestionInput, LIMITS }
