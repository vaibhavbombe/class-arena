const { GRACE_MS } = require('./attemptRules')

// Pure rules for results. Unit-tested in test/results.test.js.

// Students see their score and the answers once the test has closed (after the grace
// period, so nobody is still taking it), or earlier if the teacher released them.
function canSeeResults(test, now = new Date()) {
  if (test.resultsReleasedAt) return true
  return Boolean(test.closesAt && now.getTime() >= new Date(test.closesAt).getTime() + GRACE_MS)
}

const round1 = (n) => Math.round(n * 10) / 10

// Full review of one submitted attempt, in the order the student saw the questions.
// Shown to the student (once results are visible) and to staff (always).
function reviewView(test, attempt) {
  const results = attempt.results || []
  return {
    score: attempt.score,
    maxScore: attempt.maxScore,
    percent: attempt.maxScore ? round1((attempt.score / attempt.maxScore) * 100) : 0,
    submittedAt: attempt.submittedAt,
    submittedBy: attempt.submittedBy,
    questions: attempt.questionOrder.map((index, position) => {
      const item = test.items[index]
      const answer = attempt.answers[index] || { selectedOptionIds: [], text: '' }
      const result = results[index] || { earned: 0, correct: false }
      const base = {
        number: position + 1,
        type: item.type,
        prompt: item.prompt,
        points: item.points,
        earned: result.earned,
        correct: result.correct,
        explanation: item.explanation || '',
      }
      if (item.type === 'short') {
        return { ...base, yourText: answer.text, acceptedAnswers: item.acceptedAnswers }
      }
      const byId = new Map(item.options.map((option) => [option.id, option]))
      const order = attempt.optionOrders?.[index]?.length ? attempt.optionOrders[index] : item.options.map((option) => option.id)
      return {
        ...base,
        options: order.map((id) => ({
          id,
          text: byId.get(id).text,
          correct: byId.get(id).correct,
          selected: answer.selectedOptionIds.includes(id),
        })),
      }
    }),
  }
}

function median(sorted) {
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Class-level numbers for the teacher. `attempts` are this test's attempts.
function summarize(test, attempts) {
  const submitted = attempts.filter((attempt) => attempt.status === 'submitted')
  const scores = submitted.map((attempt) => attempt.score).sort((a, b) => a - b)
  const maxScore = test.items.reduce((sum, item) => sum + item.points, 0)
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null

  return {
    maxScore,
    submittedCount: submitted.length,
    inProgressCount: attempts.length - submitted.length,
    average: average === null ? null : round1(average),
    averagePercent: average === null || !maxScore ? null : round1((average / maxScore) * 100),
    median: median(scores),
    highest: scores.length ? scores[scores.length - 1] : null,
    lowest: scores.length ? scores[0] : null,
    // Low % correct usually means a hard or confusingly worded question.
    perQuestion: test.items.map((item, index) => {
      const correctCount = submitted.filter((attempt) => attempt.results?.[index]?.correct).length
      return {
        index,
        number: index + 1,
        type: item.type,
        prompt: item.prompt,
        points: item.points,
        correctCount,
        percentCorrect: submitted.length ? round1((correctCount / submitted.length) * 100) : null,
      }
    }),
  }
}

module.exports = { canSeeResults, reviewView, summarize }
