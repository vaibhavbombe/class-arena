// Class analytics, computed from plain data (no database), so it's unit-tested in
// test/analytics.test.js. Only submitted attempts count towards scores.

const round1 = (n) => Math.round(n * 10) / 10
const percentOf = (attempt) => (attempt.maxScore ? (attempt.score / attempt.maxScore) * 100 : 0)
const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null)

// A student "needs attention" below this average, or after this many missed tests.
const LOW_AVERAGE = 50
const MISSED_LIMIT = 2

/**
 * @param tests     published tests of the class: { id, title, status ('upcoming'|'open'|'closed'), when (Date), items: [{ questionId, prompt, tags? }] }
 * @param attempts  submitted attempts: { testId, studentId, score, maxScore, submittedAt, results: [{ correct }] }
 * @param students  enrolled students: { id, name }
 * @param tagsByQuestionId  bank tags for questions whose copies have none (older tests)
 * @param liveGames ended live games: { playerCount }
 */
function classAnalytics({ tests, attempts, students, tagsByQuestionId = {}, liveGames = [] }) {
  const ordered = [...tests].sort((a, b) => new Date(a.when) - new Date(b.when))
  // Tests students could have taken (open or closed), in time order.
  const given = ordered.filter((test) => test.status === 'open' || test.status === 'closed')
  const byTest = new Map(given.map((test) => [String(test.id), []]))
  for (const attempt of attempts) byTest.get(String(attempt.testId))?.push(attempt)
  const enrolled = new Set(students.map((student) => String(student.id)))
  // Only current students count, so someone who left doesn't skew participation.
  const counted = (list) => list.filter((attempt) => enrolled.has(String(attempt.studentId)))

  const testTrend = given.map((test) => {
    const list = counted(byTest.get(String(test.id)))
    const avg = average(list.map(percentOf))
    return {
      testId: test.id,
      title: test.title,
      status: test.status,
      when: test.when,
      submitted: list.length,
      averagePercent: avg === null ? null : round1(avg),
    }
  })

  const allCounted = given.flatMap((test) => counted(byTest.get(String(test.id))))
  const expected = given.length * students.length
  const classAverage = average(allCounted.map(percentOf))

  // Topic mastery: each answered question counts once per student, under each of its tags.
  const tagStats = new Map()
  const questionStats = []
  for (const test of given) {
    const list = counted(byTest.get(String(test.id)))
    test.items.forEach((item, index) => {
      const tags = item.tags?.length ? item.tags : (tagsByQuestionId[String(item.questionId)] || [])
      const answered = list.filter((attempt) => attempt.results?.[index])
      const correct = answered.filter((attempt) => attempt.results[index].correct).length
      if (answered.length) {
        questionStats.push({ testTitle: test.title, prompt: item.prompt, attempts: answered.length, percentCorrect: round1((correct / answered.length) * 100) })
      }
      for (const tag of tags) {
        const entry = tagStats.get(tag) || { tag, correct: 0, total: 0 }
        entry.correct += correct
        entry.total += answered.length
        tagStats.set(tag, entry)
      }
    })
  }
  const topics = [...tagStats.values()]
    .filter((entry) => entry.total > 0)
    .map((entry) => ({ ...entry, percentCorrect: round1((entry.correct / entry.total) * 100) }))
    .sort((a, b) => a.percentCorrect - b.percentCorrect || b.total - a.total)

  const hardestQuestions = questionStats
    .sort((a, b) => a.percentCorrect - b.percentCorrect || b.attempts - a.attempts)
    .slice(0, 5)

  // Per student, oldest test first.
  const closedIds = new Set(given.filter((test) => test.status === 'closed').map((test) => String(test.id)))
  const studentRows = students.map((student) => {
    const mine = given
      .map((test) => byTest.get(String(test.id)).find((attempt) => String(attempt.studentId) === String(student.id)))
      .filter(Boolean)
    const percents = mine.map(percentOf)
    const taken = new Set(mine.map((attempt) => String(attempt.testId)))
    const missed = [...closedIds].filter((id) => !taken.has(id)).length
    const avg = average(percents)
    const reasons = []
    if (avg !== null && avg < LOW_AVERAGE) reasons.push(`average below ${LOW_AVERAGE}%`)
    if (missed >= MISSED_LIMIT) reasons.push(`missed ${missed} tests`)
    return {
      studentId: student.id,
      name: student.name,
      testsTaken: mine.length,
      testsMissed: missed,
      averagePercent: avg === null ? null : round1(avg),
      lastPercent: percents.length ? round1(percents[percents.length - 1]) : null,
      needsAttention: reasons.length > 0,
      reasons,
    }
  })

  return {
    summary: {
      studentCount: students.length,
      testsGiven: given.length,
      testsUpcoming: ordered.length - given.length,
      classAveragePercent: classAverage === null ? null : round1(classAverage),
      participationPercent: expected ? round1((allCounted.length / expected) * 100) : null,
      liveGamesPlayed: liveGames.length,
      averageLivePlayers: liveGames.length ? round1(average(liveGames.map((game) => game.playerCount))) : null,
      needsAttentionCount: studentRows.filter((row) => row.needsAttention).length,
    },
    testTrend,
    topics,
    hardestQuestions,
    students: studentRows,
  }
}

module.exports = { classAnalytics, LOW_AVERAGE, MISSED_LIMIT }
