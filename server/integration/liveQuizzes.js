// Live quiz setup: staff-only authoring, question copies, choice types only, isolation.
const { run, PW, call, check, invite, finish } = require('./helpers')

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin', email: `lq-a${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `lq-b${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'lq-t-')
  const T2 = await invite(A.accessToken, 'lq-t2-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'S', email: `lq-s${run}@example.com`, password: PW, joinCode: cls.joinCode })).d

  const mcq = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'Largest planet?', options: [{ text: 'Mars' }, { text: 'Jupiter', correct: true }] }, T.accessToken)).d
  const multi = (await call('POST', '/api/questions', { type: 'multi', prompt: 'Primes?', options: [{ text: '2', correct: true }, { text: '3', correct: true }, { text: '4' }] }, T.accessToken)).d
  const short = (await call('POST', '/api/questions', { type: 'short', prompt: 'Symbol for gold?', acceptedAnswers: ['Au'] }, T.accessToken)).d
  const otherTeachers = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'T2 q', options: [{ text: 'x', correct: true }, { text: 'y' }] }, T2.accessToken)).d

  const created = await call('POST', '/api/live-quizzes', { classId: cls.id, title: 'Friday quiz' }, T.accessToken)
  check('teacher creates a live quiz in their class', created.s === 201 && created.d.title === 'Friday quiz' && created.d.questionCount === 0, created)
  const qid = created.d.id

  const withShort = await call('PUT', `/api/live-quizzes/${qid}`, { items: [{ questionId: short._id }] }, T.accessToken)
  check('short-answer questions are refused with a clear reason (400)', withShort.s === 400 && /multiple choice and multi-select/.test(withShort.d.error), withShort)
  const withOthers = await call('PUT', `/api/live-quizzes/${qid}`, { items: [{ questionId: otherTeachers._id }] }, T.accessToken)
  check("another teacher's question is refused (400)", withOthers.s === 400, withOthers)
  const badSeconds = await call('PUT', `/api/live-quizzes/${qid}`, { items: [{ questionId: mcq._id, seconds: 3 }] }, T.accessToken)
  check('time per question outside 5-120 is refused (400)', badSeconds.s === 400, badSeconds)

  const saved = await call('PUT', `/api/live-quizzes/${qid}`, { items: [{ questionId: mcq._id, seconds: 15 }, { questionId: multi._id }] }, T.accessToken)
  check('teacher saves questions with time limits (default 20s)', saved.s === 200 && saved.d.questionCount === 2 && saved.d.totalSeconds === 35 && saved.d.items[0].options.some((o) => o.correct), saved.d)

  // Reordering keeps the existing copies, even if the bank question changed in between.
  await call('PUT', `/api/questions/${mcq._id}`, { type: 'mcq', prompt: 'CHANGED IN BANK', options: [{ text: 'a', correct: true }, { text: 'b' }] }, T.accessToken)
  const reordered = await call('PUT', `/api/live-quizzes/${qid}`, { title: 'Friday quiz v2', items: [{ questionId: multi._id, seconds: 30 }, { questionId: mcq._id, seconds: 10 }] }, T.accessToken)
  check('reorder and retime keep the quiz\'s own copies', reordered.s === 200 && reordered.d.items[0].type === 'multi' && reordered.d.items[1].prompt === 'Largest planet?' && reordered.d.items[1].seconds === 10 && reordered.d.title === 'Friday quiz v2', reordered.d)

  const list = await call('GET', `/api/live-quizzes?classId=${cls.id}`, null, T.accessToken)
  check('class list shows the quiz summary', list.s === 200 && list.d.length === 1 && list.d[0].questionCount === 2 && !list.d[0].items, list.d)

  const sList = await call('GET', `/api/live-quizzes?classId=${cls.id}`, null, S.accessToken)
  const sOne = await call('GET', `/api/live-quizzes/${qid}`, null, S.accessToken)
  const sCreate = await call('POST', '/api/live-quizzes', { classId: cls.id }, S.accessToken)
  check('students cannot list, read or create live quizzes (403)', sList.s === 403 && sOne.s === 403 && sCreate.s === 403, { sList: sList.s, sOne: sOne.s, sCreate: sCreate.s })
  const t2Read = await call('GET', `/api/live-quizzes/${qid}`, null, T2.accessToken)
  const bRead = await call('GET', `/api/live-quizzes/${qid}`, null, B.accessToken)
  const bList = await call('GET', `/api/live-quizzes?classId=${cls.id}`, null, B.accessToken)
  check("other teacher and other institute can't see it (404)", t2Read.s === 404 && bRead.s === 404 && bList.s === 404, { t2Read: t2Read.s, bRead: bRead.s, bList: bList.s })
  const aRead = await call('GET', `/api/live-quizzes/${qid}`, null, A.accessToken)
  check('admin can open it', aRead.s === 200, aRead.s)

  const del = await call('DELETE', `/api/live-quizzes/${qid}`, null, T.accessToken)
  const gone = await call('GET', `/api/live-quizzes/${qid}`, null, T.accessToken)
  check('teacher deletes the quiz', del.s === 200 && gone.s === 404, { del: del.s, gone: gone.s })

  const second = (await call('POST', '/api/live-quizzes', { classId: cls.id }, T.accessToken)).d
  await call('DELETE', `/api/classes/${cls.id}`, null, T.accessToken)
  const afterClass = await call('GET', `/api/live-quizzes/${second.id}`, null, A.accessToken)
  check('deleting the class deletes its live quizzes', afterClass.s === 404, afterClass.s)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
