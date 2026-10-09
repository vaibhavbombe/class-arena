// Submit racing many answer saves: the stored score must always match the stored answers.
const Attempt = require('../models/Attempt')
const Test = require('../models/Test')
const { gradeAttempt } = require('../lib/grading')
const { PW, call, check, connectTestDb, finish } = require('./helpers')

;(async () => {
  await connectTestDb()
  let mismatches = 0
  for (let round = 0; round < 8; round++) {
    const run = `${Date.now()}${round}`
    const A = (await call('POST', '/api/auth/signup', { institutionName: 'Race', name: 'A', email: `ra${run}@example.com`, password: PW })).d
    const cls = (await call('POST', '/api/classes', { name: 'C' }, A.accessToken)).d
    const S = (await call('POST', '/api/auth/student-signup', { name: 'S', email: `rs${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
    const q = (await call('POST', '/api/questions', { type: 'short', prompt: 'Say yes', acceptedAnswers: ['yes'] }, A.accessToken)).d
    const t = (await call('POST', '/api/tests', { classId: cls.id }, A.accessToken)).d
    await call('PUT', `/api/tests/${t.id}`, { items: [{ questionId: q._id, points: 1 }] }, A.accessToken)
    await call('POST', `/api/tests/${t.id}/publish`, null, A.accessToken)
    await call('POST', `/api/tests/${t.id}/attempt`, null, S.accessToken)

    const saves = Array.from({ length: 15 }, (_, i) => () => call('PUT', `/api/tests/${t.id}/attempt/answers`, { answers: [{ index: 0, text: i % 2 ? 'yes' : 'no' }] }, S.accessToken))
    const submit = () => call('POST', `/api/tests/${t.id}/attempt/submit`, null, S.accessToken)
    const jobs = [...saves.slice(0, 7), submit, ...saves.slice(7)]
    await Promise.all(jobs.map((job) => job()))

    const attempt = await Attempt.findOne({ testId: t.id })
    const test = await Test.findById(t.id)
    const regraded = gradeAttempt(test.items, attempt.answers).score
    const ok = attempt.status === 'submitted' && regraded === attempt.score
    if (!ok) mismatches++
    console.log(`round ${round + 1}: stored answer "${attempt.answers[0].text}", stored score ${attempt.score}, regraded ${regraded} -> ${ok ? 'consistent' : 'MISMATCH'}`)
  }
  check('stored score matches stored answers in every round', mismatches === 0, mismatches)
  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
