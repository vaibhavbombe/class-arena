const test = require('node:test')
const assert = require('node:assert/strict')
const { classAnalytics } = require('../lib/analytics')

const students = [{ id: 's1', name: 'Ann' }, { id: 's2', name: 'Bob' }, { id: 's3', name: 'Cat' }]
const items = (tagsA, tagsB) => [
  { questionId: 'q1', prompt: 'Q1', tags: tagsA },
  { questionId: 'q2', prompt: 'Q2', tags: tagsB },
]
const tests = [
  { id: 't1', title: 'Week 1', status: 'closed', when: new Date('2030-01-01'), items: items(['algebra'], ['geometry']) },
  { id: 't2', title: 'Week 2', status: 'closed', when: new Date('2030-01-08'), items: items(['algebra'], undefined) },
  { id: 't3', title: 'Next week', status: 'upcoming', when: new Date('2030-01-15'), items: items([], []) },
]
const attempt = (testId, studentId, score, results) => ({ testId, studentId, score, maxScore: 10, results: results.map((correct) => ({ correct })) })
const attempts = [
  attempt('t1', 's1', 10, [true, true]),
  attempt('t1', 's2', 4, [true, false]),
  attempt('t1', 's3', 0, [false, false]),
  attempt('t2', 's1', 8, [true, true]),
  attempt('t2', 's2', 6, [false, true]),
  // s3 missed t2
  attempt('t1', 'left-the-class', 10, [true, true]), // not enrolled any more: ignored
]

const result = classAnalytics({ tests, attempts, students, tagsByQuestionId: { q2: ['fractions'] }, liveGames: [{ playerCount: 3 }, { playerCount: 2 }] })

test('summary: averages and participation use current students and given tests only', () => {
  assert.equal(result.summary.studentCount, 3)
  assert.equal(result.summary.testsGiven, 2)
  assert.equal(result.summary.testsUpcoming, 1)
  // (100 + 40 + 0 + 80 + 60) / 5 = 56
  assert.equal(result.summary.classAveragePercent, 56)
  // 5 submissions out of 2 tests x 3 students
  assert.equal(result.summary.participationPercent, 83.3)
  assert.equal(result.summary.liveGamesPlayed, 2)
  assert.equal(result.summary.averageLivePlayers, 2.5)
})

test('test trend is in time order and skips upcoming tests', () => {
  assert.deepEqual(result.testTrend.map((t) => [t.title, t.submitted, t.averagePercent]), [['Week 1', 3, 46.7], ['Week 2', 2, 70]])
})

test('topics: per-tag correct rate, weakest first, falling back to bank tags', () => {
  const byTag = Object.fromEntries(result.topics.map((t) => [t.tag, [t.correct, t.total, t.percentCorrect]]))
  assert.deepEqual(byTag.algebra, [3, 5, 60]) // t1 Q1: 2/3, t2 Q1: 1/2
  assert.deepEqual(byTag.geometry, [1, 3, 33.3])
  assert.deepEqual(byTag.fractions, [2, 2, 100]) // t2 Q2 has no copied tags -> bank tag
  assert.equal(result.topics[0].tag, 'geometry')
})

test('hardest questions: lowest % correct first', () => {
  assert.equal(result.hardestQuestions[0].percentCorrect, 33.3)
  assert.equal(result.hardestQuestions[0].testTitle, 'Week 1')
  assert.ok(result.hardestQuestions.length <= 5)
})

test('students: averages, misses, last score and attention flags', () => {
  const row = Object.fromEntries(result.students.map((s) => [s.name, s]))
  assert.deepEqual([row.Ann.averagePercent, row.Ann.testsTaken, row.Ann.lastPercent, row.Ann.needsAttention], [90, 2, 80, false])
  assert.deepEqual([row.Bob.averagePercent, row.Bob.needsAttention], [50, false]) // exactly 50 is not below 50
  assert.deepEqual([row.Cat.averagePercent, row.Cat.testsMissed, row.Cat.needsAttention], [0, 1, true])
  assert.match(row.Cat.reasons.join(), /average below 50%/)
  assert.equal(result.summary.needsAttentionCount, 1)
})

test('missing two tests flags a student even with no scores', () => {
  const r = classAnalytics({ tests, attempts: [], students: [{ id: 'x', name: 'Xi' }] })
  assert.equal(r.students[0].averagePercent, null)
  assert.equal(r.students[0].testsMissed, 2)
  assert.equal(r.students[0].needsAttention, true)
  assert.equal(r.summary.classAveragePercent, null)
  assert.equal(r.summary.participationPercent, 0)
})

test('an empty class has empty analytics, not errors', () => {
  const r = classAnalytics({ tests: [], attempts: [], students: [] })
  assert.equal(r.summary.participationPercent, null)
  assert.deepEqual(r.testTrend, [])
  assert.deepEqual(r.topics, [])
})
