const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../lib/testRules')

const id = (n) => n.toString(16).padStart(24, '0')
const HOUR = 60 * 60 * 1000

test('parseSettings validates and trims each field it is given', () => {
  const { changes, error } = rules.parseSettings({ title: '  Unit 1 quiz ', durationMinutes: 30, shuffleQuestions: true })
  assert.equal(error, undefined)
  assert.deepEqual(changes, { title: 'Unit 1 quiz', durationMinutes: 30, shuffleQuestions: true })
  assert.match(rules.parseSettings({ title: ' ' }).error, /title is required/)
  assert.match(rules.parseSettings({ durationMinutes: 0 }).error, /durationMinutes/)
  assert.match(rules.parseSettings({ durationMinutes: 601 }).error, /durationMinutes/)
  assert.match(rules.parseSettings({ durationMinutes: 10.5 }).error, /whole number/)
  assert.match(rules.parseSettings({ durationMinutes: '30' }).error, /whole number/)
  assert.match(rules.parseSettings({ shuffleOptions: 'yes' }).error, /true or false/)
})

test('parseSettings handles dates, null and the open/close order (including against saved values)', () => {
  const opens = '2030-01-01T10:00:00.000Z'
  const closes = '2030-01-01T12:00:00.000Z'
  const { changes } = rules.parseSettings({ opensAt: opens, closesAt: closes })
  assert.equal(changes.opensAt.toISOString(), opens)
  assert.equal(rules.parseSettings({ closesAt: null }).changes.closesAt, null)
  assert.match(rules.parseSettings({ opensAt: 'tomorrow-ish' }).error, /must be a date/)
  assert.match(rules.parseSettings({ opensAt: closes, closesAt: opens }).error, /after the opening time/)
  // Only closesAt sent, but it's before the saved opensAt.
  assert.match(rules.parseSettings({ closesAt: opens }, { opensAt: new Date(closes) }).error, /after the opening time/)
})

test('parseItems requires valid ids, unique questions and whole-number points', () => {
  assert.deepEqual(rules.parseItems([{ questionId: id(1), points: 2 }]).items, [{ questionId: id(1), points: 2 }])
  assert.match(rules.parseItems('nope').error, /list/)
  assert.match(rules.parseItems([{ questionId: 'abc', points: 1 }]).error, /valid questionId/)
  assert.match(rules.parseItems([{ questionId: { $ne: null }, points: 1 }]).error, /valid questionId/)
  assert.match(rules.parseItems([{ questionId: id(1), points: 1 }, { questionId: id(1), points: 1 }]).error, /twice/)
  assert.match(rules.parseItems([{ questionId: id(1), points: 0 }]).error, /Points/)
  assert.match(rules.parseItems([{ questionId: id(1), points: 1.5 }]).error, /Points/)
  assert.match(rules.parseItems(Array.from({ length: 101 }, (_, i) => ({ questionId: id(i + 1), points: 1 }))).error, /at most 100/)
})

test('after publishing, only title, instructions and closing time may change', () => {
  assert.deepEqual(rules.lockedFieldsIn({ title: 'x', instructions: 'y', closesAt: null }), [])
  assert.deepEqual(rules.lockedFieldsIn({ title: 'x', durationMinutes: 5, items: [] }), ['durationMinutes', 'items'])
})

test('testStatus follows the server clock', () => {
  const now = new Date('2030-01-01T11:00:00Z')
  const published = { status: 'published', opensAt: null, closesAt: null }
  assert.equal(rules.testStatus({ ...published, status: 'draft' }, now), 'draft')
  assert.equal(rules.testStatus(published, now), 'open')
  assert.equal(rules.testStatus({ ...published, opensAt: new Date(now.getTime() + HOUR) }, now), 'upcoming')
  assert.equal(rules.testStatus({ ...published, closesAt: new Date(now.getTime() - 1) }, now), 'closed')
  assert.equal(rules.testStatus({ ...published, closesAt: now }, now), 'closed')
})

test('publishProblem blocks empty tests and past closing times', () => {
  const now = new Date()
  assert.match(rules.publishProblem({ items: [] }, now), /at least one question/)
  assert.match(rules.publishProblem({ items: [{}], closesAt: new Date(now.getTime() - 1) }, now), /already passed/)
  assert.equal(rules.publishProblem({ items: [{}], closesAt: null }, now), null)
})

test('snapshotOf copies the question, including answers, without sharing arrays', () => {
  const question = { _id: id(7), type: 'short', prompt: 'Capital?', acceptedAnswers: ['Paris'], caseSensitive: true, explanation: 'France' }
  const snap = rules.snapshotOf(question, 3)
  assert.equal(snap.points, 3)
  assert.deepEqual(snap.acceptedAnswers, ['Paris'])
  question.acceptedAnswers.push('Lyon')
  assert.deepEqual(snap.acceptedAnswers, ['Paris'])
})

test('studentOutline never contains questions or answers', () => {
  const testDoc = {
    _id: id(9), classId: id(2), title: 'T', instructions: 'Read carefully', status: 'published',
    durationMinutes: 20, opensAt: null, closesAt: null,
    items: [
      { points: 2, type: 'mcq', prompt: 'Secret prompt', options: [{ id: 'a', text: 'A', correct: true }] },
      { points: 3, type: 'short', prompt: 'Another', acceptedAnswers: ['secret-answer'] },
    ],
  }
  const outline = rules.studentOutline(testDoc)
  assert.equal(outline.questionCount, 2)
  assert.equal(outline.totalPoints, 5)
  assert.equal(outline.items, undefined)
  const json = JSON.stringify(outline)
  for (const leaked of ['Secret prompt', 'secret-answer', 'correct', '"options"']) {
    assert.ok(!json.includes(leaked), `outline leaked ${leaked}`)
  }
})
