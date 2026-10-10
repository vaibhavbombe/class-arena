const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../lib/liveQuizRules')

const id = (n) => n.toString(16).padStart(24, '0')

test('parseTitle trims and requires a title', () => {
  assert.equal(rules.parseTitle('  Friday quiz ').title, 'Friday quiz')
  assert.match(rules.parseTitle(' ').error, /required/)
  assert.match(rules.parseTitle({ $ne: '' }).error, /required/)
  assert.match(rules.parseTitle('x'.repeat(201)).error, /at most/)
})

test('parseItems defaults seconds and enforces 5-120 whole seconds', () => {
  assert.deepEqual(rules.parseItems([{ questionId: id(1) }]).items, [{ questionId: id(1), seconds: rules.DEFAULT_SECONDS }])
  assert.equal(rules.parseItems([{ questionId: id(1), seconds: 5 }]).items[0].seconds, 5)
  assert.equal(rules.parseItems([{ questionId: id(1), seconds: 120 }]).items[0].seconds, 120)
  for (const seconds of [4, 121, 10.5, '20']) {
    assert.match(rules.parseItems([{ questionId: id(1), seconds }]).error, /seconds/)
  }
})

test('parseItems rejects bad ids, duplicates and too many questions', () => {
  assert.match(rules.parseItems('x').error, /list/)
  assert.match(rules.parseItems([{ questionId: 'nope' }]).error, /valid questionId/)
  assert.match(rules.parseItems([{ questionId: id(1) }, { questionId: id(1) }]).error, /twice/)
  assert.match(rules.parseItems(Array.from({ length: 51 }, (_, i) => ({ questionId: id(i + 1) }))).error, /at most 50/)
})

test('snapshotOf accepts choice questions and refuses short answers', () => {
  const mcq = { _id: id(1), type: 'mcq', prompt: 'P', options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: false }] }
  const { item } = rules.snapshotOf(mcq, 15)
  assert.equal(item.seconds, 15)
  assert.equal(item.options.length, 2)
  mcq.options[0].text = 'changed'
  assert.equal(item.options[0].text, 'A') // a copy, not a reference
  assert.match(rules.snapshotOf({ _id: id(2), type: 'short', prompt: 'P', acceptedAnswers: ['x'] }, 15).error, /multiple choice and multi-select/)
})

test('summary totals questions and time', () => {
  const s = rules.summary({ _id: id(9), classId: id(3), title: 'Q', items: [{ seconds: 10 }, { seconds: 25 }] })
  assert.equal(s.questionCount, 2)
  assert.equal(s.totalSeconds, 35)
})
