const test = require('node:test')
const assert = require('node:assert/strict')
const views = require('../lib/problemViews')

const problem = {
  _id: 'p1',
  classId: 'c1',
  questionId: 'q1',
  title: 'Sum',
  prompt: 'Return a + b',
  difficulty: 'easy',
  code: {
    functionName: 'solve',
    starterCode: 'function solve(a, b) {}',
    referenceSolution: 'SECRET_REFERENCE',
    sampleTests: [{ input: [1, 2], expected: 3 }],
    hiddenTests: [{ input: [777, 1], expected: 778 }, { input: [555, 5], expected: 560 }],
    timeLimitMs: 1000,
    memoryMb: 32,
  },
}

test('titleFrom uses the first line, trimmed and shortened', () => {
  assert.equal(views.titleFrom('  Two sum\nMore details'), 'Two sum')
  assert.equal(views.titleFrom('x'.repeat(100)).length, 78)
  assert.equal(views.titleFrom('   '), 'Coding problem')
})

test('the student view has samples but no hidden tests or reference solution', () => {
  const view = views.studentProblemView(problem)
  assert.equal(view.hiddenTestCount, 2)
  assert.deepEqual(view.sampleTests, [{ input: [1, 2], expected: 3 }])
  const json = JSON.stringify(view)
  for (const leaked of ['777', '555', '778', '560', 'SECRET_REFERENCE', 'hiddenTests', 'referenceSolution']) {
    assert.ok(!json.includes(leaked), `student view leaked ${leaked}`)
  }
})

test('the staff view has everything', () => {
  const view = views.staffProblemView(problem)
  assert.equal(view.hiddenTests.length, 2)
  assert.equal(view.referenceSolution, 'SECRET_REFERENCE')
})

test('studentResult keeps sample details and strips hidden ones', () => {
  const judged = {
    verdict: 'Runtime Error',
    passed: 1,
    total: 3,
    timeMs: 2,
    error: 'not shown',
    tests: [
      { index: 0, passed: true, verdict: 'Accepted', timeMs: 1, input: [1, 2], expected: 3, output: 3, logs: ['hi'] },
      { index: 1, passed: false, verdict: 'Wrong Answer', timeMs: 1, input: [777, 1], expected: 778, output: 0, logs: ['saw 777'] },
      { index: 2, passed: false, verdict: 'Runtime Error', timeMs: 1, input: [555, 5], expected: 560, error: 'bad value 555' },
    ],
  }
  const safe = views.studentResult(judged, 1)
  assert.deepEqual(safe.tests[0].input, [1, 2])
  assert.deepEqual(safe.tests[0].logs, ['hi'])
  assert.deepEqual(safe.tests.map((t) => [t.kind, t.number]), [['sample', 1], ['hidden', 1], ['hidden', 2]])
  assert.equal(safe.error, null) // only compile errors are passed through
  const json = JSON.stringify(safe)
  for (const leaked of ['777', '778', '555', '560', 'saw 777', 'bad value']) assert.ok(!json.includes(leaked), `result leaked ${leaked}`)
})

test('compile errors are shown (they are about the student\'s own code)', () => {
  const safe = views.studentResult({ verdict: 'Compile Error', passed: 0, total: 3, tests: [], error: 'Unexpected token' }, 1)
  assert.equal(safe.error, 'Unexpected token')
})

test('problemStatus: solved beats attempted beats new', () => {
  assert.equal(views.problemStatus([]), 'new')
  assert.equal(views.problemStatus([{ verdict: 'Wrong Answer' }]), 'attempted')
  assert.equal(views.problemStatus([{ verdict: 'Wrong Answer' }, { verdict: 'Accepted' }]), 'solved')
})
