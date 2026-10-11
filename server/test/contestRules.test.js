const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../lib/contestRules')

const start = new Date('2030-01-01T10:00:00Z')
const at = (minute) => new Date(start.getTime() + minute * 60000)
const contest = (extra = {}) => ({ published: true, startsAt: start, durationMinutes: 120, freezeMinutes: 0, penaltyMinutes: 20, problems: [{}, {}, {}], ...extra })
const sub = (studentId, problemIndex, minute, verdict, status = 'done') => ({ studentId, problemIndex, createdAt: at(minute), verdict, status })
const students = [{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob' }, { id: 'cat', name: 'Cat' }]

test('labels and settings validation', () => {
  assert.deepEqual([0, 1, 25].map(rules.label), ['A', 'B', 'Z'])
  assert.equal(rules.parseSettings({ durationMinutes: 90, freezeMinutes: 30 }).changes.freezeMinutes, 30)
  assert.match(rules.parseSettings({ durationMinutes: 60, freezeMinutes: 60 }).error, /freeze must be shorter/)
  assert.match(rules.parseSettings({ freezeMinutes: 120 }, { durationMinutes: 90 }).error, /freeze must be shorter/)
  assert.match(rules.parseSettings({ durationMinutes: 5 }).error, /durationMinutes/)
  assert.match(rules.parseSettings({ penaltyMinutes: 61 }).error, /penaltyMinutes/)
  assert.match(rules.parseSettings({ startsAt: 'soon' }).error, /date/)
  assert.match(rules.parseProblemIds([]).error, /1 to 12/)
  assert.match(rules.parseProblemIds(['a'.repeat(24), 'a'.repeat(24)]).error, /twice/)
})

test('status follows the clock (draft, upcoming, running, frozen, ended)', () => {
  const c = contest({ freezeMinutes: 30 })
  assert.equal(rules.contestStatus({ ...c, published: false }, at(10)), 'draft')
  assert.equal(rules.contestStatus(c, at(-1)), 'upcoming')
  assert.equal(rules.contestStatus(c, at(0)), 'running')
  assert.equal(rules.contestStatus(c, at(89)), 'running')
  assert.equal(rules.contestStatus(c, at(90)), 'frozen')
  assert.equal(rules.contestStatus(c, at(120)), 'ended')
})

test('ICPC scoring: solves, penalty minutes, wrong tries only on solved problems', () => {
  const subs = [
    sub('ann', 0, 10, 'Wrong Answer'), sub('ann', 0, 15, 'Accepted'), // A at 15 + 20 = 35
    sub('ann', 1, 40, 'Accepted'), // B at 40 -> total 75
    sub('bob', 0, 12, 'Accepted'), // A at 12
    sub('bob', 1, 30, 'Wrong Answer'), sub('bob', 1, 31, 'Wrong Answer'), // unsolved: no penalty
    sub('cat', 2, 5, 'Compile Error'), sub('cat', 2, 6, 'Judge Error'), sub('cat', 2, 8, 'Accepted'), // not penalised -> 8
  ]
  const { rows, frozen } = rules.standings({ contest: contest(), submissions: subs, students, now: at(60) })
  assert.equal(frozen, false)
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  assert.deepEqual([by.Ann.solved, by.Ann.penalty, by.Ann.rank], [2, 75, 1])
  assert.deepEqual([by.Cat.solved, by.Cat.penalty, by.Cat.rank], [1, 8, 2])
  assert.deepEqual([by.Bob.solved, by.Bob.penalty, by.Bob.rank], [1, 12, 3])
  assert.equal(by.Bob.problems[1].wrongTries, 2)
  assert.equal(by.Bob.problems[1].solved, false)
  assert.deepEqual([by.Ann.problems[0].minute, by.Ann.problems[0].wrongTries], [15, 1])
})

test('first solver of each problem is marked', () => {
  const { rows } = rules.standings({ contest: contest(), submissions: [sub('ann', 0, 15, 'Accepted'), sub('bob', 0, 12, 'Accepted')], students, now: at(60) })
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  assert.equal(by.Bob.problems[0].firstSolve, true)
  assert.equal(by.Ann.problems[0].firstSolve, false)
})

test('ties share a rank; nobody-submitted students are listed last', () => {
  const { rows } = rules.standings({ contest: contest(), submissions: [sub('ann', 0, 10, 'Accepted'), sub('bob', 1, 10, 'Accepted')], students, now: at(60) })
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [['Ann', 1], ['Bob', 1], ['Cat', 3]])
})

test('submissions outside the window do not count; queued ones show as pending', () => {
  const subs = [sub('ann', 0, -5, 'Accepted'), sub('ann', 0, 130, 'Accepted'), sub('bob', 0, 20, null, 'queued')]
  const { rows } = rules.standings({ contest: contest(), submissions: subs, students, now: at(125) })
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  assert.equal(by.Ann.solved, 0)
  assert.equal(by.Bob.problems[0].pending, 1)
})

test('freeze: students see the board as of the freeze, staff see everything', () => {
  const c = contest({ freezeMinutes: 30 }) // freezes at minute 90
  const subs = [sub('ann', 0, 50, 'Accepted'), sub('bob', 0, 95, 'Accepted'), sub('bob', 1, 100, 'Wrong Answer')]
  const studentView = rules.standings({ contest: c, submissions: subs, students, now: at(110) })
  const staffView = rules.standings({ contest: c, submissions: subs, students, now: at(110), staff: true })
  const sBob = studentView.rows.find((r) => r.name === 'Bob')
  assert.equal(studentView.frozen, true)
  assert.deepEqual([sBob.solved, sBob.problems[0].frozenTries, sBob.problems[1].frozenTries], [0, 1, 1])
  assert.equal(staffView.frozen, false)
  assert.equal(staffView.rows.find((r) => r.name === 'Bob').solved, 1)
  const after = rules.standings({ contest: c, submissions: subs, students, now: at(121) })
  assert.equal(after.frozen, false)
  assert.equal(after.rows.find((r) => r.name === 'Bob').solved, 1)
})
