// Taking tests: start/resume, answer stripping, autosave, submit, grading, deadlines.
const Attempt = require('../models/Attempt')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const inMinutes = (m) => new Date(Date.now() + m * 60e3).toISOString()

;(async () => {
  await connectTestDb()

  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin', email: `aa${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'at-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T.accessToken)).d
  const otherCls = (await call('POST', '/api/classes', { name: 'Other' }, T.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'Stu', email: `as${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const S2 = (await call('POST', '/api/auth/student-signup', { name: 'Outsider', email: `ao${run}@example.com`, password: PW, joinCode: otherCls.joinCode })).d

  const q = async (body) => (await call('POST', '/api/questions', body, T.accessToken)).d
  const qMcq = await q({ type: 'mcq', prompt: 'Largest planet?', options: [{ text: 'Mars' }, { text: 'Jupiter', correct: true }], explanation: 'SECRET-EXPLANATION' })
  const qMulti = await q({ type: 'multi', prompt: 'Primes?', options: [{ text: '2', correct: true }, { text: '3', correct: true }, { text: '4' }] })
  const qShort = await q({ type: 'short', prompt: 'Symbol for gold?', acceptedAnswers: ['Au'] })
  const correctMcq = qMcq.options.find((o) => o.correct).id
  const multiIds = qMulti.options.map((o) => o.id)

  async function makeTest(settings, publish = true) {
    const t = (await call('POST', '/api/tests', { classId: cls.id, title: settings.title || 'T' }, T.accessToken)).d
    await call('PUT', `/api/tests/${t.id}`, { items: [{ questionId: qMcq._id, points: 2 }, { questionId: qMulti._id, points: 3 }, { questionId: qShort._id, points: 5 }], ...settings }, T.accessToken)
    if (publish) await call('POST', `/api/tests/${t.id}/publish`, null, T.accessToken)
    return t.id
  }

  const draftId = await makeTest({}, false)
  const draftStart = await call('POST', `/api/tests/${draftId}/attempt`, null, S.accessToken)
  check('cannot start a draft test (404)', draftStart.s === 404, draftStart)
  const upcomingId = await makeTest({ opensAt: inMinutes(60) })
  const upStart = await call('POST', `/api/tests/${upcomingId}/attempt`, null, S.accessToken)
  check('cannot start before it opens (409)', upStart.s === 409, upStart)

  const tid = await makeTest({ title: 'Main', durationMinutes: 30 })
  const staffStart = await call('POST', `/api/tests/${tid}/attempt`, null, T.accessToken)
  const outsiderStart = await call('POST', `/api/tests/${tid}/attempt`, null, S2.accessToken)
  check('teachers cannot take tests (403); students outside the class get 404', staffStart.s === 403 && outsiderStart.s === 404, { staff: staffStart.s, outsider: outsiderStart.s })

  // Five Start clicks at once -> exactly one attempt.
  const starts = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/api/tests/${tid}/attempt`, null, S.accessToken)))
  const count = await Attempt.countDocuments({ testId: tid })
  check('five simultaneous starts create exactly one attempt', starts.every((r) => r.s === 200 || r.s === 201) && count === 1, { statuses: starts.map((r) => r.s), count })
  const view = starts.find((r) => r.s === 201)?.d || starts[0].d
  const json = JSON.stringify(view)
  check('attempt view has the questions but no answers or explanations', view.questions.length === 3 && !/correct|acceptedAnswers|SECRET-EXPLANATION|"Au"/.test(json), json.slice(0, 300))
  const minutesLeft = (new Date(view.deadline) - new Date(view.serverNow)) / 60e3
  check('deadline is set by the server: ~30 minutes from start', minutesLeft > 29.9 && minutesLeft <= 30, minutesLeft)

  const byIndex = Object.fromEntries(view.questions.map((qq) => [qq.type, qq.index]))
  const bad1 = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: byIndex.mcq, selectedOptionIds: ['nope'] }] }, S.accessToken)
  const bad2 = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: byIndex.mcq, selectedOptionIds: qMcq.options.map((o) => o.id) }] }, S.accessToken)
  const bad3 = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: 9, text: 'x' }] }, S.accessToken)
  check('invalid answers rejected (unknown option, two picks on MCQ, bad index)', bad1.s === 400 && bad2.s === 400 && bad3.s === 400, { bad1: bad1.s, bad2: bad2.s, bad3: bad3.s })

  const save1 = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: byIndex.mcq, selectedOptionIds: [correctMcq] }, { index: byIndex.multi, selectedOptionIds: [multiIds[0]] }] }, S.accessToken)
  const save2 = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: byIndex.short, text: '  au ' }] }, S.accessToken)
  check('autosave stores answers (revision increases)', save1.s === 200 && save2.s === 200 && save2.d.revision > save1.d.revision, { save1, save2 })
  const reload = await call('GET', `/api/tests/${tid}/attempt`, null, S.accessToken)
  const reloadShort = reload.d.questions.find((qq) => qq.type === 'short')
  check('reloading shows saved answers in the same order', reloadShort.answer.text === '  au ' && JSON.stringify(reload.d.questions.map((qq) => qq.index)) === JSON.stringify(view.questions.map((qq) => qq.index)), reload.d.questions.map((qq) => qq.answer))

  const submit = await call('POST', `/api/tests/${tid}/attempt/submit`, { answers: [{ index: byIndex.multi, selectedOptionIds: [multiIds[0], multiIds[1]] }] }, S.accessToken)
  check('submit (with a final answer) -> submitted, no questions returned', submit.s === 200 && submit.d.status === 'submitted' && submit.d.submittedBy === 'student' && !submit.d.questions, submit.d)
  const graded = await Attempt.findOne({ testId: tid })
  check('graded on the server: 2 + 3 + 5 = 10/10 (case/space-insensitive short answer)', graded.score === 10 && graded.maxScore === 10, { score: graded.score, max: graded.maxScore })
  const lateSave = await call('PUT', `/api/tests/${tid}/attempt/answers`, { answers: [{ index: byIndex.short, text: 'changed' }] }, S.accessToken)
  const reSubmit = await call('POST', `/api/tests/${tid}/attempt/submit`, null, S.accessToken)
  const unchanged = await Attempt.findOne({ testId: tid })
  check('after submitting: saves rejected (409), re-submit harmless, score unchanged', lateSave.s === 409 && reSubmit.s === 200 && unchanged.score === 10 && unchanged.answers[byIndex.short].text === '  au ', { lateSave: lateSave.s, reSubmit: reSubmit.s })

  // Deadline: move it into the past, as if the student had closed the browser.
  const tid2 = await makeTest({ title: 'Timed' })
  const v2 = (await call('POST', `/api/tests/${tid2}/attempt`, null, S.accessToken)).d
  const i2 = Object.fromEntries(v2.questions.map((qq) => [qq.type, qq.index]))
  await call('PUT', `/api/tests/${tid2}/attempt/answers`, { answers: [{ index: i2.mcq, selectedOptionIds: [correctMcq] }] }, S.accessToken)
  await Attempt.updateOne({ testId: tid2 }, { deadline: new Date(Date.now() - 2000) })
  const inGrace = await call('PUT', `/api/tests/${tid2}/attempt/answers`, { answers: [{ index: i2.short, text: 'Au' }] }, S.accessToken)
  check('a save 2s after the deadline is accepted (5s grace)', inGrace.s === 200, inGrace)
  await Attempt.updateOne({ testId: tid2 }, { deadline: new Date(Date.now() - 60e3) })
  const tooLate = await call('PUT', `/api/tests/${tid2}/attempt/answers`, { answers: [{ index: i2.multi, selectedOptionIds: multiIds.slice(0, 2) }] }, S.accessToken)
  const timedOut = await Attempt.findOne({ testId: tid2 })
  check('after the deadline: save refused and attempt auto-submitted with what was saved (2 + 5 = 7)', tooLate.s === 409 && timedOut.status === 'submitted' && timedOut.submittedBy === 'timeout' && timedOut.score === 7, { tooLate: tooLate.s, status: timedOut.status, by: timedOut.submittedBy, score: timedOut.score })

  const tid3 = await makeTest({ title: 'Closing soon', durationMinutes: 30, closesAt: inMinutes(5) })
  const v3 = (await call('POST', `/api/tests/${tid3}/attempt`, null, S.accessToken)).d
  const left3 = (new Date(v3.deadline) - new Date(v3.serverNow)) / 60e3
  check('deadline is capped at the closing time (5 min, not 30)', left3 > 4.8 && left3 <= 5, left3)

  const tid4 = await makeTest({ title: 'Shuffled', shuffleQuestions: true, shuffleOptions: true })
  const v4 = (await call('POST', `/api/tests/${tid4}/attempt`, null, S.accessToken)).d
  const v4b = (await call('GET', `/api/tests/${tid4}/attempt`, null, S.accessToken)).d
  const stored = await Attempt.findOne({ testId: tid4 })
  check('shuffled order is stored and identical on reload', JSON.stringify(v4.questions.map((qq) => [qq.index, qq.options?.map((o) => o.id)])) === JSON.stringify(v4b.questions.map((qq) => [qq.index, qq.options?.map((o) => o.id)])) && stored.questionOrder.length === 3, null)

  const sList = await call('GET', `/api/tests?classId=${cls.id}`, null, S.accessToken)
  const mainRow = sList.d.find((t) => t.id === tid)
  check('student list shows my attempt status', mainRow.myAttempt.status === 'submitted' && sList.d.find((t) => t.id === tid4).myAttempt.status === 'in_progress', sList.d.map((t) => t.myAttempt))
  const tList = await call('GET', `/api/tests?classId=${cls.id}`, null, T.accessToken)
  check('teacher list shows started/submitted counts', tList.d.find((t) => t.id === tid).attempts.submitted === 1, tList.d.map((t) => t.attempts))
  const delTaken = await call('DELETE', `/api/tests/${tid}`, null, T.accessToken)
  check("a test students have started can't be deleted (409)", delTaken.s === 409, delTaken)

  const removeStudent = await call('DELETE', `/api/members/${S.user.id}`, null, A.accessToken)
  const left = await Attempt.countDocuments({ studentId: S.user.id })
  check("removing a student deletes their attempts", removeStudent.s === 200 && left === 0, { removeStudent: removeStudent.s, left })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
