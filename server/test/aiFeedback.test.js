const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../lib/ai/feedback')

const problem = { title: 'Sum', prompt: 'Return the sum of nums.', functionName: 'sum', sampleTests: [{ input: [[1, 2, 3]], expected: 6 }] }
const good = { summary: 'A clear solution that passes every test.', strengths: ['Good use of a running total.'], improvements: ['Name the loop variable after what it holds.'], complexity: 'Linear in the length of the list.' }

test('valid feedback passes; complexity is optional', () => {
  assert.equal(fb.validateFeedback(good, 'sum'), null)
  const { complexity, ...noComplexity } = good
  assert.equal(fb.validateFeedback(noComplexity, 'sum'), null)
})

test('wrong shape, too many points and code anywhere are rejected', () => {
  assert.match(fb.validateFeedback({ ...good, strengths: ['a1234', 'b1234', 'c1234', 'd1234'] }, 'sum'), /at most 3/)
  assert.match(fb.validateFeedback({ ...good, rating: 5 }, 'sum'), /not allowed/)
  assert.match(fb.validateFeedback({ summary: 'ok enough text' }, 'sum'), /missing/)
  assert.match(fb.validateFeedback({ ...good, improvements: ['Write it as nums.reduce((a, b) => a + b, 0)'] }, 'sum'), /contains code/)
  assert.match(fb.validateFeedback({ ...good, summary: 'Try function sum(nums) { return 0 } instead.' }, 'sum'), /contains code/)
})

test('prompt: verdict, sample failures, hidden failures as a count only, code as data', () => {
  const submission = {
    code: 'function sum(nums) { return nums.reduce((a, b) => a + b) }',
    verdict: 'Runtime Error', passed: 1, total: 3,
    tests: [
      { kind: 'sample', index: 0, passed: true, input: [[1, 2, 3]], expected: 6, output: 6 },
      { kind: 'hidden', index: 1, number: 1, passed: false, verdict: 'Runtime Error' },
      { kind: 'hidden', index: 2, number: 2, passed: false, verdict: 'Runtime Error' },
    ],
  }
  const [system, user] = fb.buildFeedbackMessages({ problem, submission })
  assert.match(system.content, /did not pass every test/)
  assert.match(system.content, /never write code/)
  assert.match(user.content, /Result: Runtime Error, 1 of 3 tests passed/)
  assert.match(user.content, /2 hidden test\(s\) failed \(their inputs are secret\)/)
  assert.match(user.content, /<student_code>\nfunction sum/)
  const accepted = fb.buildFeedbackMessages({ problem, submission: { ...submission, verdict: 'Accepted', passed: 3, tests: [] } })
  assert.match(accepted[0].content, /passed every test/)
})

test('fallback feedback for accepted and failed submissions, never code', () => {
  const ok = fb.fallbackFeedback({ verdict: 'Accepted', passed: 3, total: 3 })
  assert.match(ok.summary, /passes every test/)
  const slow = fb.fallbackFeedback({ verdict: 'Time Limit Exceeded', passed: 1, total: 3 })
  assert.match(slow.summary, /1 of 3/)
  assert.match(slow.improvements[0], /too slow/)
  assert.equal(fb.fallbackFeedback({ verdict: 'Compile Error', passed: 0, total: 3 }).strengths.length, 0)
  for (const f of [ok, slow]) assert.equal(fb.validateFeedback(f, 'sum'), null)
})
