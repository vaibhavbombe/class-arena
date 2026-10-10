// Coding questions in the bank: validation, staff-only hidden tests, "check with judge",
// and tests refusing coding questions until they can be graded.
const { run, PW, call, check, invite, finish } = require('./helpers')

const code = (extra = {}) => ({
  functionName: 'solve',
  starterCode: 'function solve(a, b) {\n  // your code\n}\n',
  referenceSolution: 'function solve(a, b) { return a + b }',
  sampleTests: [{ input: [1, 2], expected: 3 }],
  hiddenTests: [{ input: [10, 5], expected: 15 }, { input: [-1, 1], expected: 0 }],
  timeLimitMs: 500,
  ...extra,
})

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Code', name: 'Admin', email: `cq-a${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Other', name: 'Admin B', email: `cq-b${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'cq-t-')
  const cls = (await call('POST', '/api/classes', { name: 'JS 101' }, T.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'S', email: `cq-s${run}@example.com`, password: PW, joinCode: cls.joinCode })).d

  const created = await call('POST', '/api/questions', { type: 'code', prompt: 'Return the sum of a and b.', tags: ['basics'], code: code() }, T.accessToken)
  check('teacher creates a coding question', created.s === 201 && created.d.type === 'code' && created.d.code.hiddenTests.length === 2 && created.d.code.functionName === 'solve', created)
  const qid = created.d._id

  const bad = await call('POST', '/api/questions', { type: 'code', prompt: 'P', code: code({ functionName: 'not valid' }) }, T.accessToken)
  check('invalid settings are refused with a reason', bad.s === 400 && /functionName/.test(bad.d.error), bad)

  const studentRead = await call('GET', `/api/questions/${qid}`, null, S.accessToken)
  const studentCheck = await call('POST', '/api/questions/check-code', { code: code(), solution: 'function solve(){}' }, S.accessToken)
  const otherInstitute = await call('GET', `/api/questions/${qid}`, null, B.accessToken)
  check('students cannot read coding questions (hidden tests) or use the judge check; other institutes get 404', studentRead.s === 403 && studentCheck.s === 403 && otherInstitute.s === 404, { studentRead: studentRead.s, studentCheck: studentCheck.s, otherInstitute: otherInstitute.s })

  const good = await call('POST', '/api/questions/check-code', { code: code(), solution: code().referenceSolution }, T.accessToken)
  check('check with judge: the reference solution passes every sample and hidden test', good.s === 200 && good.d.verdict === 'Accepted' && good.d.passed === 3 && good.d.tests.map((t) => t.kind).join() === 'sample,hidden,hidden', good.d)
  check('the teacher sees inputs, expected values and outputs (it is their own test data)', good.d.tests[1].input[0] === 10 && good.d.tests[1].output === 15, good.d.tests[1])

  const typo = await call('POST', '/api/questions/check-code', { code: code({ hiddenTests: [{ input: [10, 5], expected: 16 }] }), solution: code().referenceSolution }, T.accessToken)
  check('a wrong expected value is caught: shows which test and what the solution returned', typo.d.verdict === 'Wrong Answer' && typo.d.tests[1].kind === 'hidden' && typo.d.tests[1].output === 15 && typo.d.tests[1].expected === 16, typo.d)

  const slow = await call('POST', '/api/questions/check-code', { code: code({ timeLimitMs: 200 }), solution: 'function solve() { while (true) {} }' }, T.accessToken)
  check('the check runs inside the sandbox limits', slow.d.verdict === 'Time Limit Exceeded', slow.d)

  const edited = await call('PUT', `/api/questions/${qid}`, { type: 'code', prompt: 'Return a + b', code: code({ hiddenTests: [{ input: [2, 2], expected: 4 }, { input: [1, 1], expected: null }] }) }, T.accessToken)
  check('editing keeps null as a valid expected value', edited.s === 200 && edited.d.code.hiddenTests[1].expected === null, edited.d?.code)

  const test = (await call('POST', '/api/tests', { classId: cls.id }, T.accessToken)).d
  const addToTest = await call('PUT', `/api/tests/${test.id}`, { items: [{ questionId: qid, points: 1 }] }, T.accessToken)
  check("coding questions can't be added to tests yet (clear 400)", addToTest.s === 400 && /Coding questions/.test(addToTest.d.error), addToTest)
  const quiz = (await call('POST', '/api/live-quizzes', { classId: cls.id }, T.accessToken)).d
  const addToQuiz = await call('PUT', `/api/live-quizzes/${quiz.id}`, { items: [{ questionId: qid }] }, T.accessToken)
  check('or to live quizzes', addToQuiz.s === 400, addToQuiz)

  const byType = await call('GET', '/api/questions?type=code', null, T.accessToken)
  check('filter by type finds coding questions', byType.d.length === 1 && byType.d[0]._id === qid, byType.d.length)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
