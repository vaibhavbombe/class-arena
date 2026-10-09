// Results: visibility rules, release/hide, statistics, per-student review, overdue attempts.
const Attempt = require('../models/Attempt')
const Test = require('../models/Test')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const student = async (name, code) => (await call('POST', '/api/auth/student-signup', { name, email: `${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: code })).d

;(async () => {
  await connectTestDb()

  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin', email: `ra${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `rb${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'rt-')
  const T2 = await invite(A.accessToken, 'rt2-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T.accessToken)).d
  const [Ann, Bob, Cat, Dan] = [await student('Ann', cls.joinCode), await student('Bob', cls.joinCode), await student('Cat', cls.joinCode), await student('Dan', cls.joinCode)]

  const qMcq = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'Largest planet?', options: [{ text: 'Mars' }, { text: 'Jupiter', correct: true }], explanation: 'Jupiter is a gas giant' }, T.accessToken)).d
  const qShort = (await call('POST', '/api/questions', { type: 'short', prompt: 'Symbol for gold?', acceptedAnswers: ['Au'] }, T.accessToken)).d
  const right = qMcq.options.find((o) => o.correct).id
  const wrong = qMcq.options.find((o) => !o.correct).id

  const t = (await call('POST', '/api/tests', { classId: cls.id, title: 'Quiz' }, T.accessToken)).d
  await call('PUT', `/api/tests/${t.id}`, { items: [{ questionId: qMcq._id, points: 2 }, { questionId: qShort._id, points: 3 }], closesAt: new Date(Date.now() + 3600e3).toISOString() }, T.accessToken)
  await call('POST', `/api/tests/${t.id}/publish`, null, T.accessToken)

  async function take(S, mcqId, text, submit = true) {
    const v = (await call('POST', `/api/tests/${t.id}/attempt`, null, S.accessToken)).d
    const idx = Object.fromEntries(v.questions.map((q) => [q.type, q.index]))
    await call('PUT', `/api/tests/${t.id}/attempt/answers`, { answers: [{ index: idx.mcq, selectedOptionIds: [mcqId] }, { index: idx.short, text }] }, S.accessToken)
    if (submit) return (await call('POST', `/api/tests/${t.id}/attempt/submit`, null, S.accessToken)).d
  }
  const annSubmit = await take(Ann, right, 'au') // 5/5
  await take(Bob, right, 'Ag') // 2/5
  await take(Cat, wrong, 'Ag', false) // in progress -> will be overdue
  // Dan never starts.

  const leaked = JSON.stringify(annSubmit)
  check('right after submitting (test still open): no score, no answers', annSubmit.status === 'submitted' && annSubmit.resultsVisible === false && !annSubmit.review && !/Jupiter is a gas giant|"Au"|score/.test(leaked), annSubmit)
  const annList = await call('GET', `/api/tests?classId=${cls.id}`, null, Ann.accessToken)
  check('student list hides the score until results are visible', annList.d[0].myAttempt.status === 'submitted' && annList.d[0].myAttempt.score === undefined, annList.d[0].myAttempt)

  // Cat's time runs out: the results page should submit it before computing.
  await Attempt.updateOne({ testId: t.id, studentId: Cat.user.id }, { deadline: new Date(Date.now() - 60e3) })
  const results = await call('GET', `/api/tests/${t.id}/results`, null, T.accessToken)
  const byName = Object.fromEntries(results.d.students.map((r) => [r.name, r]))
  check('results list every enrolled student, including one who never started', results.s === 200 && results.d.students.length === 4 && byName.Dan.status === 'not_started', results.d.students?.map((r) => [r.name, r.status]))
  check('overdue attempt was submitted (timeout) before showing results', byName.Cat.status === 'submitted' && byName.Cat.submittedBy === 'timeout' && byName.Cat.score === 0, byName.Cat)
  const st = results.d.stats
  check('stats: 3 submitted, average 2.3/5, median 2, high 5, low 0', st.submittedCount === 3 && st.average === 2.3 && st.median === 2 && st.highest === 5 && st.lowest === 0, st)
  check('per-question % correct: MCQ 66.7%, short 33.3%', JSON.stringify(st.perQuestion.map((q) => q.percentCorrect)) === '[66.7,33.3]', st.perQuestion)

  const bobDetail = await call('GET', `/api/tests/${t.id}/results/${Bob.user.id}`, null, T.accessToken)
  const bobShort = bobDetail.d.questions?.find((q) => q.type === 'short')
  check("teacher sees a student's marked answers", bobDetail.s === 200 && bobDetail.d.score === 2 && bobShort.yourText === 'Ag' && bobShort.correct === false && bobShort.acceptedAnswers[0] === 'Au', bobDetail.d)
  const danDetail = await call('GET', `/api/tests/${t.id}/results/${Dan.user.id}`, null, T.accessToken)
  check('detail for a student who never started -> 404', danDetail.s === 404, danDetail)

  const sResults = await call('GET', `/api/tests/${t.id}/results`, null, Ann.accessToken)
  const sOther = await call('GET', `/api/tests/${t.id}/results/${Bob.user.id}`, null, Ann.accessToken)
  const sRelease = await call('POST', `/api/tests/${t.id}/release`, { released: true }, Ann.accessToken)
  check('students cannot see class results, others\' answers, or release (403)', sResults.s === 403 && sOther.s === 403 && sRelease.s === 403, { sResults: sResults.s, sOther: sOther.s, sRelease: sRelease.s })
  const t2Results = await call('GET', `/api/tests/${t.id}/results`, null, T2.accessToken)
  const bResults = await call('GET', `/api/tests/${t.id}/results`, null, B.accessToken)
  check('other teacher / other institute cannot see results (404)', t2Results.s === 404 && bResults.s === 404, { t2: t2Results.s, b: bResults.s })

  const release = await call('POST', `/api/tests/${t.id}/release`, { released: true }, T.accessToken)
  const annAfter = await call('GET', `/api/tests/${t.id}/attempt`, null, Ann.accessToken)
  const annMcq = annAfter.d.review?.questions.find((q) => q.type === 'mcq')
  check('after release: student sees score, marked options and explanation', release.s === 200 && release.d.resultsVisible === true && annAfter.d.review.score === 5 && annMcq.options.find((o) => o.correct).selected === true && annMcq.explanation === 'Jupiter is a gas giant', annAfter.d.review)
  const annList2 = await call('GET', `/api/tests?classId=${cls.id}`, null, Ann.accessToken)
  check('after release: score appears in the student list', annList2.d[0].myAttempt.score === 5 && annList2.d[0].myAttempt.maxScore === 5, annList2.d[0].myAttempt)

  await call('POST', `/api/tests/${t.id}/release`, { released: false }, T.accessToken)
  const annHidden = await call('GET', `/api/tests/${t.id}/attempt`, null, Ann.accessToken)
  check('teacher can hide results again before the test closes', annHidden.d.resultsVisible === false && !annHidden.d.review, annHidden.d)

  // Once the closing time (plus grace) has passed, results are visible without a release.
  await Test.updateOne({ _id: t.id }, { closesAt: new Date(Date.now() - 10e3) })
  const annClosed = await call('GET', `/api/tests/${t.id}/attempt`, null, Ann.accessToken)
  check('after the test closes, results are visible automatically', annClosed.d.resultsVisible === true && annClosed.d.review?.score === 5, annClosed.d.resultsVisible)
  const badRelease = await call('POST', `/api/tests/${t.id}/release`, { released: 'yes' }, T.accessToken)
  check('release needs a boolean (400)', badRelease.s === 400, badRelease)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
