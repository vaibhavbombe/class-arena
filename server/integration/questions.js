// Question bank: permissions, tenant isolation, CRUD, search, type changes.
const { run, PW, call, check, invite, finish } = require('./helpers')

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin A', email: `qa${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `qb${run}@example.com`, password: PW })).d
  const T1 = await invite(A.accessToken, 'qt1-')
  const T2 = await invite(A.accessToken, 'qt2-')
  const cls = (await call('POST', '/api/classes', { name: 'C' }, T1.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'S', email: `qs${run}@example.com`, password: PW, joinCode: cls.joinCode })).d

  const mcq = { type: 'mcq', prompt: 'Largest planet?', options: [{ text: 'Earth' }, { text: 'Jupiter', correct: true }, { text: 'Mars' }], tags: ['Astronomy'], explanation: 'Jupiter is a gas giant.' }
  const q1 = await call('POST', '/api/questions', mcq, T1.accessToken)
  check('teacher creates MCQ (server assigns option ids)', q1.s === 201 && q1.d.options.length === 3 && q1.d.options.every((o) => o.id) && q1.d.ownerId === T1.user.id, q1)
  const q2 = await call('POST', '/api/questions', { type: 'short', prompt: 'Chemical symbol for gold?', acceptedAnswers: ['Au'], tags: ['chemistry'] }, T1.accessToken)
  check('teacher creates short-answer question', q2.s === 201 && q2.d.acceptedAnswers[0] === 'Au', q2)
  const q3 = await call('POST', '/api/questions', { type: 'multi', prompt: 'Prime numbers?', options: [{ text: '2', correct: true }, { text: '3', correct: true }, { text: '4' }] }, T2.accessToken)
  check('second teacher creates multi-select', q3.s === 201, q3)

  const bad = await call('POST', '/api/questions', { ...mcq, options: [{ text: 'a' }, { text: 'b' }] }, T1.accessToken)
  check('invalid question rejected with a reason (400)', bad.s === 400 && /exactly one/.test(bad.d.error), bad)

  const sList = await call('GET', '/api/questions', null, S.accessToken)
  const sOne = await call('GET', `/api/questions/${q1.d._id}`, null, S.accessToken)
  const sCreate = await call('POST', '/api/questions', mcq, S.accessToken)
  check('students cannot list, read or create questions (403)', sList.s === 403 && sOne.s === 403 && sCreate.s === 403, { sList: sList.s, sOne: sOne.s, sCreate: sCreate.s })

  const t1List = await call('GET', '/api/questions', null, T1.accessToken)
  check("teacher sees only their own questions", t1List.d.length === 2 && t1List.d.every((q) => q.ownerId === T1.user.id), t1List.d.length)
  const t2Read = await call('GET', `/api/questions/${q1.d._id}`, null, T2.accessToken)
  const t2Edit = await call('PUT', `/api/questions/${q1.d._id}`, mcq, T2.accessToken)
  const t2Del = await call('DELETE', `/api/questions/${q1.d._id}`, null, T2.accessToken)
  check("teacher can't read, edit or delete another teacher's question (404)", t2Read.s === 404 && t2Edit.s === 404 && t2Del.s === 404, { t2Read: t2Read.s, t2Edit: t2Edit.s, t2Del: t2Del.s })

  const aList = await call('GET', '/api/questions', null, A.accessToken)
  check('admin sees all questions in the institute, with owner names', aList.d.length === 3 && aList.d.some((q) => q.ownerName === 'qt2-'), aList.d.length)
  const bList = await call('GET', '/api/questions', null, B.accessToken)
  const bRead = await call('GET', `/api/questions/${q1.d._id}`, null, B.accessToken)
  check('other institute sees none of them (empty list, 404)', bList.d.length === 0 && bRead.s === 404, { bList: bList.d.length, bRead: bRead.s })

  const byType = await call('GET', '/api/questions?type=short', null, A.accessToken)
  const byTag = await call('GET', '/api/questions?tag=astronomy', null, A.accessToken)
  const bySearch = await call('GET', '/api/questions?q=GOLD', null, A.accessToken)
  const regexy = await call('GET', '/api/questions?q=' + encodeURIComponent('(a+)+$'), null, A.accessToken)
  check('filter by type, tag and case-insensitive search', byType.d.length === 1 && byTag.d.length === 1 && bySearch.d.length === 1, { type: byType.d.length, tag: byTag.d.length, search: bySearch.d.length })
  check('regex characters in search are treated as text', regexy.s === 200 && regexy.d.length === 0, regexy)
  const tags = await call('GET', '/api/questions/tags', null, A.accessToken)
  check('tag list', JSON.stringify(tags.d) === JSON.stringify(['astronomy', 'chemistry']), tags.d)

  const toShort = await call('PUT', `/api/questions/${q1.d._id}`, { type: 'short', prompt: 'Largest planet (one word)?', acceptedAnswers: ['Jupiter'] }, T1.accessToken)
  const reread = await call('GET', `/api/questions/${q1.d._id}`, null, T1.accessToken)
  check('editing MCQ into short answer removes the old options', toShort.s === 200 && reread.d.type === 'short' && reread.d.options === undefined && reread.d.acceptedAnswers[0] === 'Jupiter', reread.d)
  const adminEdit = await call('PUT', `/api/questions/${q3.d._id}`, { type: 'multi', prompt: 'Which are prime?', options: [{ text: '2', correct: true }, { text: '9' }] }, A.accessToken)
  check("admin can edit a teacher's question", adminEdit.s === 200 && adminEdit.d.prompt === 'Which are prime?', adminEdit)

  const del = await call('DELETE', `/api/questions/${q2.d._id}`, null, T1.accessToken)
  const gone = await call('GET', `/api/questions/${q2.d._id}`, null, T1.accessToken)
  check('owner deletes a question', del.s === 200 && gone.s === 404, { del: del.s, gone: gone.s })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
