// Coding practice: assigning problems, what students can see, queued submissions judged by
// the worker, hidden-test secrecy, rate limiting, staff overview, stale-job recovery.
const CodeSubmission = require('../models/CodeSubmission')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Hidden test values chosen to be easy to spot if they ever leak.
const HIDDEN = [{ input: [7771, 1], expected: 7772 }, { input: [5551, 9], expected: 5560 }]

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Practice', name: 'Admin', email: `pr-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'pr-t-')
  const T2 = await invite(A.accessToken, 'pr-t2-')
  const cls = (await call('POST', '/api/classes', { name: 'JS' }, T.accessToken)).d
  const other = (await call('POST', '/api/classes', { name: 'Other' }, T2.accessToken)).d
  const student = async (name, code) => (await call('POST', '/api/auth/student-signup', { name, email: `pr-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: code })).d
  const [S, S2, Out] = [await student('Ann', cls.joinCode), await student('Bob', cls.joinCode), await student('Out', other.joinCode)]

  const q = (await call('POST', '/api/questions', { type: 'code', prompt: 'Add two numbers\nReturn a + b.', code: { functionName: 'add', starterCode: 'function add(a, b) {\n}\n', referenceSolution: 'SECRET_REF function add(a,b){return a+b}', sampleTests: [{ input: [1, 2], expected: 3 }], hiddenTests: HIDDEN, timeLimitMs: 300 } }, T.accessToken)).d
  const mcq = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'P', options: [{ text: 'a', correct: true }, { text: 'b' }] }, T.accessToken)).d
  const t2q = (await call('POST', '/api/questions', { type: 'code', prompt: 'T2', code: { functionName: 'f', sampleTests: [{ input: [], expected: 1 }], hiddenTests: [{ input: [], expected: 1 }] } }, T2.accessToken)).d

  const assigned = await call('POST', '/api/problems', { classId: cls.id, questionId: q._id }, T.accessToken)
  check('teacher assigns a coding question to the class', assigned.s === 201 && assigned.d.title === 'Add two numbers' && assigned.d.hiddenTests.length === 2, assigned)
  const pid = assigned.d.id
  const notCode = await call('POST', '/api/problems', { classId: cls.id, questionId: mcq._id }, T.accessToken)
  const notMine = await call('POST', '/api/problems', { classId: cls.id, questionId: t2q._id }, T.accessToken)
  const byStudent = await call('POST', '/api/problems', { classId: cls.id, questionId: q._id }, S.accessToken)
  check('only coding questions, only your own, only staff', notCode.s === 400 && notMine.s === 404 && byStudent.s === 403, { notCode: notCode.s, notMine: notMine.s, byStudent: byStudent.s })

  const view = await call('GET', `/api/problems/${pid}`, null, S.accessToken)
  const viewJson = JSON.stringify(view.d)
  check('student sees prompt, starter code and samples', view.s === 200 && view.d.functionName === 'add' && view.d.sampleTests.length === 1 && view.d.hiddenTestCount === 2 && view.d.status === 'new', view.d)
  check('student view contains no hidden tests or reference solution', !/7771|7772|5551|5560|SECRET_REF|hiddenTests|referenceSolution/.test(viewJson), viewJson.slice(0, 300))
  const outsider = await call('GET', `/api/problems/${pid}`, null, Out.accessToken)
  check('students outside the class get 404', outsider.s === 404, outsider.s)

  async function submitAndWait(token, code) {
    const queued = await call('POST', `/api/problems/${pid}/submit`, { code }, token)
    if (queued.s !== 202) return { queued }
    for (let i = 0; i < 40; i++) {
      const res = await call('GET', `/api/problems/${pid}/submissions/${queued.d.id}`, null, token)
      if (res.d.status === 'done') return { queued, result: res.d }
      await sleep(250)
    }
    return { queued, result: null }
  }

  const ok = await submitAndWait(S.accessToken, 'function add(a, b) { return a + b }')
  check('submit answers 202 "queued" right away', ok.queued.s === 202 && ok.queued.d.status === 'queued', ok.queued)
  check('the worker judges it: Accepted, 3 of 3', ok.result?.verdict === 'Accepted' && ok.result.passed === 3 && ok.result.total === 3, ok.result)
  check('result shows sample details but hidden tests only as pass/fail', ok.result?.tests[0].kind === 'sample' && ok.result.tests[0].output === 3 && ok.result.tests[1].kind === 'hidden' && ok.result.tests[1].input === undefined && ok.result.tests[1].output === undefined, ok.result?.tests)

  const tooFast = await call('POST', `/api/problems/${pid}/submit`, { code: 'function add(a, b) { return a + b }' }, S.accessToken)
  check('a second submit within 5 seconds is refused (429)', tooFast.s === 429, tooFast)

  await sleep(5200)
  const wrong = await submitAndWait(S.accessToken, 'function add(a, b) { console.log("got", a, b); return a < 1000 ? a + b : 0 }')
  const wrongJson = JSON.stringify(wrong.result)
  check('wrong on hidden tests: Wrong Answer, 1 of 3, hidden failures without data', wrong.result?.verdict === 'Wrong Answer' && wrong.result.passed === 1 && wrong.result.tests[1].passed === false, wrong.result)
  check('no hidden values leak through results or console.log', !/7771|7772|5551|5560/.test(wrongJson), wrongJson.slice(0, 400))

  const loop = await submitAndWait(S2.accessToken, 'function add() { while (true) {} }')
  check('an infinite loop gets Time Limit Exceeded', loop.result?.verdict === 'Time Limit Exceeded', loop.result)
  const peek = await call('GET', `/api/problems/${pid}/submissions/${ok.queued.d.id}`, null, S2.accessToken)
  check("students can't open each other's submissions", peek.s === 404, peek.s)

  const list = await call('GET', `/api/problems?classId=${cls.id}`, null, S.accessToken)
  check('student list shows "solved" with attempt count', list.d[0].status === 'solved' && list.d[0].attempts === 2, list.d)
  const staffList = await call('GET', `/api/problems?classId=${cls.id}`, null, T.accessToken)
  check('teacher list shows 2 attempted, 1 solved', staffList.d[0].attempted === 2 && staffList.d[0].solved === 1, staffList.d)
  const staffView = await call('GET', `/api/problems/${pid}`, null, T.accessToken)
  const ann = staffView.d.students?.find((s) => s.name === 'Ann')
  check('teacher sees each student: solved, attempts, best', ann?.solved && ann.attempts === 2 && ann.best.passed === 3 && staffView.d.students.length === 2, staffView.d.students)
  const teacherSeesCode = await call('GET', `/api/problems/${pid}/submissions/${wrong.queued.d.id}`, null, T.accessToken)
  check("teacher can read a student's submitted code", teacherSeesCode.s === 200 && /console\.log/.test(teacherSeesCode.d.code), teacherSeesCode.s)

  // The problem kept its own copy: editing the bank question doesn't change it.
  await call('PUT', `/api/questions/${q._id}`, { type: 'code', prompt: 'CHANGED', code: { functionName: 'changed', sampleTests: [{ input: [], expected: 1 }], hiddenTests: [{ input: [], expected: 1 }] } }, T.accessToken)
  const after = await call('GET', `/api/problems/${pid}`, null, S.accessToken)
  check('editing the bank question leaves the assigned problem unchanged', after.d.functionName === 'add' && after.d.title === 'Add two numbers', after.d)

  // A submission stuck in the queue (judge lost it) becomes a Judge Error, not a forever spinner.
  const stuck = await CodeSubmission.create({ institutionId: A.user.institutionId, classId: cls.id, problemId: pid, studentId: S.user.id, code: 'x' })
  // createdAt is immutable through Mongoose, so backdate it on the raw collection.
  await CodeSubmission.collection.updateOne({ _id: stuck._id }, { $set: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } })
  const stale = await call('GET', `/api/problems/${pid}/submissions/${stuck.id}`, null, S.accessToken)
  check('a stale queued submission is settled as Judge Error', stale.d.status === 'done' && stale.d.verdict === 'Judge Error', stale.d)

  const del = await call('DELETE', `/api/problems/${pid}`, null, T.accessToken)
  const remaining = await CodeSubmission.countDocuments({ problemId: pid })
  check('removing the problem removes its submissions', del.s === 200 && remaining === 0, { del: del.s, remaining })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
