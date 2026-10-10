const crypto = require('crypto')
const { isCorrect } = require('./grading')

// Pure rules for live games. Unit-tested in test/liveGameRules.test.js.

const MAX_POINTS = 1000
// Answers that arrive just after the buzzer (network delay) still count, scored as at the buzzer.
const ANSWER_GRACE_MS = 1000

// Kahoot-style speed scoring: 1000 for an instant correct answer, 500 at the buzzer, 0 if wrong.
function pointsFor(correct, elapsedMs, limitMs) {
  if (!correct) return 0
  const fraction = Math.min(Math.max(elapsedMs / limitMs, 0), 1)
  return Math.round(MAX_POINTS * (1 - fraction / 2))
}

function isCorrectChoice(item, optionIds) {
  return isCorrect(item, { selectedOptionIds: optionIds })
}

// Validates a player's choice against the question.
function parseChoice(item, optionIds) {
  if (!Array.isArray(optionIds) || !optionIds.length || !optionIds.every((id) => typeof id === 'string')) {
    return { error: 'Pick an answer' }
  }
  const valid = new Set(item.options.map((option) => option.id))
  const unique = [...new Set(optionIds)]
  if (!unique.every((id) => valid.has(id))) return { error: 'Unknown option' }
  if (item.type === 'mcq' && unique.length !== 1) return { error: 'Pick one answer' }
  return { optionIds: unique }
}

// The question as players see it: no correct flags, no explanation.
function questionForPlayers(item, index, total, endsAt, now) {
  return {
    index,
    number: index + 1,
    total,
    type: item.type,
    prompt: item.prompt,
    options: item.options.map(({ id, text }) => ({ id, text })),
    seconds: item.seconds,
    endsAt,
    serverNow: now,
  }
}

// How many players picked each option.
function distribution(item, answers) {
  const counts = Object.fromEntries(item.options.map((option) => [option.id, 0]))
  for (const answer of answers) for (const id of answer.optionIds) if (id in counts) counts[id]++
  return counts
}

// 6-digit PIN, never starting with 0 (easier to read out loud).
function generatePin() {
  return String(crypto.randomInt(100000, 1000000))
}

module.exports = { MAX_POINTS, ANSWER_GRACE_MS, pointsFor, isCorrectChoice, parseChoice, questionForPlayers, distribution, generatePin }
