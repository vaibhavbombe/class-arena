const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../lib/liveGameRules')

const mcq = { type: 'mcq', prompt: 'P', seconds: 20, explanation: 'SECRET', options: [{ id: 'a', text: 'A', correct: false }, { id: 'b', text: 'B', correct: true }] }
const multi = { type: 'multi', prompt: 'M', seconds: 20, options: [{ id: 'x', text: 'X', correct: true }, { id: 'y', text: 'Y', correct: true }, { id: 'z', text: 'Z', correct: false }] }

test('speed scoring: 1000 instant, 500 at the buzzer, 0 when wrong', () => {
  assert.equal(rules.pointsFor(true, 0, 20000), 1000)
  assert.equal(rules.pointsFor(true, 10000, 20000), 750)
  assert.equal(rules.pointsFor(true, 20000, 20000), 500)
  assert.equal(rules.pointsFor(true, 25000, 20000), 500) // late (grace period) counts as the buzzer
  assert.equal(rules.pointsFor(true, -50, 20000), 1000)
  assert.equal(rules.pointsFor(false, 0, 20000), 0)
})

test('choices are validated against the question', () => {
  assert.deepEqual(rules.parseChoice(mcq, ['b']).optionIds, ['b'])
  assert.match(rules.parseChoice(mcq, ['a', 'b']).error, /one answer/)
  assert.match(rules.parseChoice(mcq, []).error, /Pick an answer/)
  assert.match(rules.parseChoice(mcq, ['zzz']).error, /Unknown/)
  assert.match(rules.parseChoice(mcq, 'b').error, /Pick an answer/)
  assert.deepEqual(rules.parseChoice(multi, ['x', 'y', 'x']).optionIds, ['x', 'y'])
})

test('correctness: single and all-or-nothing multi-select', () => {
  assert.equal(rules.isCorrectChoice(mcq, ['b']), true)
  assert.equal(rules.isCorrectChoice(mcq, ['a']), false)
  assert.equal(rules.isCorrectChoice(multi, ['y', 'x']), true)
  assert.equal(rules.isCorrectChoice(multi, ['x']), false)
})

test('players never receive correct flags or explanations', () => {
  const view = rules.questionForPlayers(mcq, 0, 5, 123, 100)
  const json = JSON.stringify(view)
  assert.ok(!json.includes('correct') && !json.includes('SECRET'))
  assert.equal(view.number, 1)
  assert.deepEqual(view.options, [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])
})

test('distribution counts each picked option', () => {
  assert.deepEqual(rules.distribution(multi, [{ optionIds: ['x', 'y'] }, { optionIds: ['x'] }, { optionIds: ['bogus'] }]), { x: 2, y: 1, z: 0 })
})

test('PINs are 6 digits and never start with 0', () => {
  for (let i = 0; i < 200; i++) assert.match(rules.generatePin(), /^[1-9][0-9]{5}$/)
})
