// Server-side grading. Pure functions, unit-tested in test/grading.test.js.

// Spacing never matters; case matters only if the question says so.
function normalizeText(text, caseSensitive) {
  const collapsed = String(text ?? '').trim().replace(/\s+/g, ' ')
  return caseSensitive ? collapsed : collapsed.toLowerCase()
}

// Multiple choice: the one correct option. Multi-select: exactly the set of correct
// options (all-or-nothing). Short answer: matches any accepted answer after normalising.
function isCorrect(item, answer) {
  if (!answer) return false
  if (item.type === 'short') {
    const given = normalizeText(answer.text, item.caseSensitive)
    if (!given) return false
    return item.acceptedAnswers.some((accepted) => normalizeText(accepted, item.caseSensitive) === given)
  }
  const selected = new Set(answer.selectedOptionIds || [])
  const correct = item.options.filter((option) => option.correct).map((option) => option.id)
  if (item.type === 'mcq' && selected.size !== 1) return false
  return selected.size === correct.length && correct.every((id) => selected.has(id))
}

// items: the test's copies of its questions; answers: aligned by index.
function gradeAttempt(items, answers) {
  const results = items.map((item, index) => {
    const correct = isCorrect(item, answers[index])
    return { index, correct, earned: correct ? item.points : 0, max: item.points }
  })
  return {
    results,
    score: results.reduce((sum, result) => sum + result.earned, 0),
    maxScore: results.reduce((sum, result) => sum + result.max, 0),
  }
}

module.exports = { normalizeText, isCorrect, gradeAttempt }
