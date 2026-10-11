// Coding questions inside timed tests: partial credit from hidden tests, graded by the judge
// after submit, never revealing hidden inputs, and grading that always finishes.
const Attempt = require('../models/Attempt')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Hidden inputs chosen to be easy to spot if they leak. The 4th is negative.
// Timestamps are blanked before searching: '…T16:16:41Z' would otherwise match 41.
const withoutDates = (value) => JSON.stringify(value).replace(/"\d{4}-\d\d-\d\dT[^"]*"/g, '""')
const HIDDEN = [{ input: [41], expected: 82 }, { input: [43], expected: 86 }, { input: [47], expected: 94 }, { input: [-53], expected: -106 }]

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'CodeTests', name: 'Admin', email: `ct-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'ct-t-')
  const cls = (await call('POST', '/api/classes', { name: 'JS' }, T.accessToken)).d
  const student = async (name) => (await call('POST', '/api/auth/student-signup', { name, email: `ct-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const [ann, bob, cat] = [await student('Ann'), await student('Bob'), await student('Cat')]

  const codeQ = (await call('POST', '/api/questions', { type: 'code', prompt: 'Double it', code: { functionName: 'double', starterCode: 'function double(n) {\n}\n', sampleTests: [{ input: [2], expected: 4 }], hiddenTests: HIDDEN, timeLimitMs: 300 } }, T.accessToken)).d
  const mcq = (await call('POST', '/api/questions', { type: 'mcq', prompt: '2 + 2?', options: [{ text: '4', correct: true }, { text: '5' }] }, T.accessToken)).d
  const right = mcq.options.find((o) => o.correct).id

  const test = (await call('POST', '/api/tests', { classId: cls.id, title: 'Mixed' }, T.accessToken)).d
  const saved = await call('PUT', `/api/tests/${test.id}`, { items: [{ questionId: mcq._id, points: 2 }, { questionId: codeQ._id, points: 4 }] }, T.accessToken)
  check('a coding question can be added to a test with points', saved.s === 200 && saved.d.totalPoints === 6 && saved.d.items[1].code.hiddenTests.length === 4, saved.d)
  await call('POST', `/api/tests/${test.id}/publish`, null, T.accessToken)

  async function take(S, code) {
    const view = (await call('POST', `/api/tests/${test.id}/attempt`, null, S.accessToken)).d
    const byType = Object.fromEntries(view.questions.map((q) => [q.type, q]))
    const answers = [{ index: byType.mcq.index, selectedOptionIds: [right] }]
    if (code !== null) answers.push({ index: byType.code.index, text: code })
    const submitted = (await call('POST', `/api/tests/${test.id}/attempt/submit`, { answers }, S.accessToken)).d
    return { view, byType, submitted }
  }

  const annRun = await take(ann, 'function double(n) { return n < 0 ? 0 : n * 2 }') // fails the negative hidden test
  const codeView = annRun.byType.code
  check('student gets the coding question with samples and starter code', codeView.code.functionName === 'double' && codeView.code.sampleTests.length === 1 && codeView.code.hiddenTestCount === 4, codeView)
  check('the attempt view never contains hidden test values', !/\b41\b|\b43\b|\b47\b|-53|-106|hiddenTests/.test(withoutDates(annRun.view)), null)

  const right_after = await Attempt.findOne({ testId: test.id, studentId: ann.user.id })
  check('right after submit: other questions graded, coding answer pending', right_after.score === 2 && right_after.codePending.length === 1, { score: right_after.score, pending: right_after.codePending })

  let detail
  for (let i = 0; i < 40; i++) {
    detail = (await call('GET', `/api/tests/${test.id}/results/${ann.user.id}`, null, T.accessToken)).d
    if (detail.gradingPending === 0) break
    await sleep(250)
  }
  const codeResult = detail.questions.find((q) => q.yourCode !== undefined)
  check('the judge grades it: 3 of 4 hidden tests = 3 of 4 points', detail.gradingPending === 0 && codeResult.passedTests === 3 && codeResult.totalTests === 4 && codeResult.earned === 3, codeResult)
  check('the score includes partial credit (2 + 3 = 5 of 6)', detail.score === 5 && detail.maxScore === 6, { score: detail.score, max: detail.maxScore })

  await take(bob, null) // no code at all
  const bobAttempt = await Attempt.findOne({ testId: test.id, studentId: bob.user.id })
  check('an empty coding answer scores 0 immediately (nothing pending)', bobAttempt.score === 2 && bobAttempt.codePending.length === 0, { score: bobAttempt.score, pending: bobAttempt.codePending })

  await take(cat, 'function double() { while (true) {} }')
  let catDetail
  for (let i = 0; i < 40; i++) {
    catDetail = (await call('GET', `/api/tests/${test.id}/results/${cat.user.id}`, null, T.accessToken)).d
    if (catDetail.gradingPending === 0) break
    await sleep(250)
  }
  const catCode = catDetail.questions.find((q) => q.yourCode !== undefined)
  check('an infinite loop gets 0 coding points (Time Limit Exceeded)', catCode.earned === 0 && catCode.verdict === 'Time Limit Exceeded', catCode)

  await call('POST', `/api/tests/${test.id}/release`, { released: true }, T.accessToken)
  const annReview = (await call('GET', `/api/tests/${test.id}/attempt`, null, ann.accessToken)).d
  const annCode = annReview.review?.questions.find((q) => q.yourCode !== undefined)
  check('after release the student sees their code and 3/4 hidden tests passed', annCode?.passedTests === 3 && annReview.review.score === 5, annCode)
  check('the review never shows hidden test inputs', !/\b41\b|\b43\b|\b47\b|-53|-106/.test(withoutDates(annReview.review)), null)

  const stats = (await call('GET', `/api/tests/${test.id}/results`, null, T.accessToken)).d
  check('class results average the partial scores (5, 2, 2 of 6)', stats.stats.average === 3, stats.stats)

  // A coding job the judge lost: after a few minutes it's settled as 0 / Judge Error.
  await Attempt.collection.updateOne({ testId: bobAttempt.testId, studentId: bobAttempt.studentId }, {
    $set: { codePending: [bobAttempt.results.find((r) => r.max === 4).index], submittedAt: new Date(Date.now() - 10 * 60 * 1000) },
  })
  const settled = (await call('GET', `/api/tests/${test.id}/results/${bob.user.id}`, null, T.accessToken)).d
  check('lost grading jobs are settled as Judge Error with 0 points', settled.gradingPending === 0 && settled.questions.find((q) => q.yourCode !== undefined).verdict === 'Judge Error', settled.questions)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
