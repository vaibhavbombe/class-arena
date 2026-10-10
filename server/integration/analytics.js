// Class analytics over HTTP: access rules and numbers from real tests and attempts.
const Test = require('../models/Test')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Stats', name: 'Admin', email: `an-a${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Other', name: 'Admin B', email: `an-b${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'an-t-')
  const T2 = await invite(A.accessToken, 'an-t2-')
  const cls = (await call('POST', '/api/classes', { name: 'Maths' }, T.accessToken)).d
  const student = async (name) => (await call('POST', '/api/auth/student-signup', { name, email: `an-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const [ann, bob] = [await student('Ann'), await student('Bob')]

  const q1 = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'Algebra Q', tags: ['algebra'], options: [{ text: 'right', correct: true }, { text: 'wrong' }] }, T.accessToken)).d
  const q2 = (await call('POST', '/api/questions', { type: 'short', prompt: 'Geometry Q', tags: ['geometry'], acceptedAnswers: ['90'] }, T.accessToken)).d
  const right = q1.options.find((o) => o.correct).id
  const wrong = q1.options.find((o) => !o.correct).id

  const t = (await call('POST', '/api/tests', { classId: cls.id, title: 'Week 1' }, T.accessToken)).d
  await call('PUT', `/api/tests/${t.id}`, { items: [{ questionId: q1._id, points: 1 }, { questionId: q2._id, points: 1 }] }, T.accessToken)
  await call('POST', `/api/tests/${t.id}/publish`, null, T.accessToken)

  async function take(S, optionId, text) {
    const v = (await call('POST', `/api/tests/${t.id}/attempt`, null, S.accessToken)).d
    const idx = Object.fromEntries(v.questions.map((q) => [q.type, q.index]))
    await call('POST', `/api/tests/${t.id}/attempt/submit`, { answers: [{ index: idx.mcq, selectedOptionIds: [optionId] }, { index: idx.short, text }] }, S.accessToken)
  }
  await take(ann, right, '90') // 100%
  await take(bob, wrong, '45') // 0%

  const res = await call('GET', `/api/classes/${cls.id}/analytics`, null, T.accessToken)
  const d = res.d
  check('teacher gets class analytics', res.s === 200 && d.summary.studentCount === 2 && d.summary.testsGiven === 1, d.summary)
  check('class average 50% and full participation', d.summary.classAveragePercent === 50 && d.summary.participationPercent === 100, d.summary)
  check('topic mastery from the copied tags', JSON.stringify(d.topics.map((x) => [x.tag, x.percentCorrect]).sort()) === JSON.stringify([['algebra', 50], ['geometry', 50]]), d.topics)
  const rows = Object.fromEntries(d.students.map((s) => [s.name, s]))
  check('per-student averages and attention flag', rows.Ann.averagePercent === 100 && rows.Bob.averagePercent === 0 && rows.Bob.needsAttention && !rows.Ann.needsAttention, d.students)
  check('test trend has the test', d.testTrend.length === 1 && d.testTrend[0].averagePercent === 50 && d.testTrend[0].submitted === 2, d.testTrend)

  // An older test without copied tags falls back to the bank question's tags.
  await Test.updateOne({ _id: t.id }, { $unset: { 'items.0.tags': 1, 'items.1.tags': 1 } })
  const fallback = await call('GET', `/api/classes/${cls.id}/analytics`, null, T.accessToken)
  check('older tests fall back to bank tags', fallback.d.topics.some((x) => x.tag === 'algebra'), fallback.d.topics)

  const byStudent = await call('GET', `/api/classes/${cls.id}/analytics`, null, ann.accessToken)
  const byOtherTeacher = await call('GET', `/api/classes/${cls.id}/analytics`, null, T2.accessToken)
  const byOtherInstitute = await call('GET', `/api/classes/${cls.id}/analytics`, null, B.accessToken)
  const byAdmin = await call('GET', `/api/classes/${cls.id}/analytics`, null, A.accessToken)
  check('students 403, other teacher and other institute 404, admin allowed', byStudent.s === 403 && byOtherTeacher.s === 404 && byOtherInstitute.s === 404 && byAdmin.s === 200, { byStudent: byStudent.s, byOtherTeacher: byOtherTeacher.s, byOtherInstitute: byOtherInstitute.s, byAdmin: byAdmin.s })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
