// Tests: drafts, question copies, publish lock, student outline, isolation.
const { run, PW, call, check, invite, finish } = require('./helpers')

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString()

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin A', email: `ta${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `tb${run}@example.com`, password: PW })).d
  const T1 = await invite(A.accessToken, 'tt1-')
  const T2 = await invite(A.accessToken, 'tt2-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T1.accessToken)).d
  const other = (await call('POST', '/api/classes', { name: 'Other' }, T2.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'S', email: `ts${run}@example.com`, password: PW, joinCode: cls.joinCode })).d

  const q1 = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'SECRET-PROMPT-1', options: [{ text: 'A' }, { text: 'B', correct: true }] }, T1.accessToken)).d
  const q2 = (await call('POST', '/api/questions', { type: 'short', prompt: 'Symbol for gold?', acceptedAnswers: ['SECRET-ANSWER-Au'] }, T1.accessToken)).d
  const qT2 = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'T2 question', options: [{ text: 'x', correct: true }, { text: 'y' }] }, T2.accessToken)).d

  const draft = await call('POST', '/api/tests', { classId: cls.id, title: 'Unit 1' }, T1.accessToken)
  check('teacher creates a draft test in their class', draft.s === 201 && draft.d.status === 'draft' && draft.d.durationMinutes === 30, draft)
  const tid = draft.d.id
  const inOther = await call('POST', '/api/tests', { classId: other.id }, T1.accessToken)
  const byStudent = await call('POST', '/api/tests', { classId: cls.id }, S.accessToken)
  const byB = await call('POST', '/api/tests', { classId: cls.id }, B.accessToken)
  check("can't create a test in someone else's class (404), as a student (403), or from another institute (404)", inOther.s === 404 && byStudent.s === 403 && byB.s === 404, { inOther: inOther.s, byStudent: byStudent.s, byB: byB.s })

  const sDraftList = await call('GET', `/api/tests?classId=${cls.id}`, null, S.accessToken)
  const sDraft = await call('GET', `/api/tests/${tid}`, null, S.accessToken)
  check('students cannot see drafts', sDraftList.d.length === 0 && sDraft.s === 404, { list: sDraftList.d.length, one: sDraft.s })

  const withT2q = await call('PUT', `/api/tests/${tid}`, { items: [{ questionId: qT2._id, points: 1 }] }, T1.accessToken)
  check("teacher can't add another teacher's question (400)", withT2q.s === 400, withT2q)
  const saved = await call('PUT', `/api/tests/${tid}`, {
    instructions: 'No calculators', durationMinutes: 20, opensAt: inHours(-1), closesAt: inHours(24),
    items: [{ questionId: q1._id, points: 2 }, { questionId: q2._id, points: 3 }],
  }, T1.accessToken)
  check('teacher saves settings and questions (copied into the test)', saved.s === 200 && saved.d.items.length === 2 && saved.d.totalPoints === 5 && saved.d.items[1].acceptedAnswers[0] === 'SECRET-ANSWER-Au', saved)
  const badDates = await call('PUT', `/api/tests/${tid}`, { closesAt: inHours(-2) }, T1.accessToken)
  check('closing before opening is rejected (checked against saved opensAt)', badDates.s === 400, badDates)
  const dup = await call('PUT', `/api/tests/${tid}`, { items: [{ questionId: q1._id, points: 1 }, { questionId: q1._id, points: 1 }] }, T1.accessToken)
  check('duplicate question rejected', dup.s === 400, dup)

  // Edit the bank question while the test is a draft: publish picks up the latest version.
  await call('PUT', `/api/questions/${q1._id}`, { type: 'mcq', prompt: 'SECRET-PROMPT-1 (fixed typo)', options: [{ text: 'A' }, { text: 'B', correct: true }] }, T1.accessToken)
  const published = await call('POST', `/api/tests/${tid}/publish`, null, T1.accessToken)
  check('publish refreshes copies from the bank', published.s === 200 && published.d.status === 'open' && published.d.items[0].prompt.endsWith('(fixed typo)'), published)
  const again = await call('POST', `/api/tests/${tid}/publish`, null, T1.accessToken)
  check('publishing twice -> 409', again.s === 409, again)

  // After publishing, bank edits/deletes don't touch the test.
  await call('PUT', `/api/questions/${q2._id}`, { type: 'short', prompt: 'CHANGED', acceptedAnswers: ['changed'] }, T1.accessToken)
  await call('DELETE', `/api/questions/${q1._id}`, null, T1.accessToken)
  const afterBank = await call('GET', `/api/tests/${tid}`, null, T1.accessToken)
  check('published test keeps its own copy after the bank question is edited or deleted', afterBank.d.items[1].prompt === 'Symbol for gold?' && afterBank.d.items[0].prompt.startsWith('SECRET-PROMPT-1'), afterBank.d.items.map((i) => i.prompt))

  const lockedEdit = await call('PUT', `/api/tests/${tid}`, { durationMinutes: 90, items: [] }, T1.accessToken)
  check('published: duration and questions are locked (409, names the fields)', lockedEdit.s === 409 && /durationMinutes, items/.test(lockedEdit.d.error), lockedEdit)
  const extend = await call('PUT', `/api/tests/${tid}`, { title: 'Unit 1 quiz', closesAt: inHours(48) }, T1.accessToken)
  check('published: title and closing time can still change', extend.s === 200 && extend.d.title === 'Unit 1 quiz', extend)

  const sList = await call('GET', `/api/tests?classId=${cls.id}`, null, S.accessToken)
  const sOne = await call('GET', `/api/tests/${tid}`, null, S.accessToken)
  const leaked = JSON.stringify([sList.d, sOne.d])
  check('student sees the outline: status, duration, counts', sOne.s === 200 && sOne.d.status === 'open' && sOne.d.questionCount === 2 && sOne.d.totalPoints === 5 && sList.d.length === 1, sOne.d)
  check('student outline contains no question text or answers', !/SECRET|items|correct|acceptedAnswers|options/.test(leaked), leaked.slice(0, 300))
  const sEdit = await call('PUT', `/api/tests/${tid}`, { title: 'hacked' }, S.accessToken)
  const sPub = await call('POST', `/api/tests/${tid}/publish`, null, S.accessToken)
  const sDel = await call('DELETE', `/api/tests/${tid}`, null, S.accessToken)
  check('students cannot edit, publish or delete (403)', sEdit.s === 403 && sPub.s === 403 && sDel.s === 403, { sEdit: sEdit.s, sPub: sPub.s, sDel: sDel.s })

  const t2View = await call('GET', `/api/tests/${tid}`, null, T2.accessToken)
  const bView = await call('GET', `/api/tests/${tid}`, null, B.accessToken)
  const bList = await call('GET', `/api/tests?classId=${cls.id}`, null, B.accessToken)
  check("other teacher and other institute can't see the test (404)", t2View.s === 404 && bView.s === 404 && bList.s === 404, { t2: t2View.s, b: bView.s, bList: bList.s })
  const aView = await call('GET', `/api/tests/${tid}`, null, A.accessToken)
  check('admin sees the full test including answers', aView.s === 200 && aView.d.items[1].acceptedAnswers[0] === 'SECRET-ANSWER-Au', aView.s)

  const upcoming = (await call('POST', '/api/tests', { classId: cls.id, title: 'Next week' }, T1.accessToken)).d
  await call('PUT', `/api/tests/${upcoming.id}`, { opensAt: inHours(24), items: [{ questionId: q2._id, points: 1 }] }, T1.accessToken)
  const upPub = await call('POST', `/api/tests/${upcoming.id}/publish`, null, T1.accessToken)
  check('a test with a future opening time is "upcoming"', upPub.d.status === 'upcoming', upPub.d.status)
  const empty = (await call('POST', '/api/tests', { classId: cls.id }, T1.accessToken)).d
  const emptyPub = await call('POST', `/api/tests/${empty.id}/publish`, null, T1.accessToken)
  check('an empty test cannot be published (400)', emptyPub.s === 400, emptyPub)

  const delCls = await call('DELETE', `/api/classes/${cls.id}`, null, T1.accessToken)
  const testGone = await call('GET', `/api/tests/${tid}`, null, A.accessToken)
  check("deleting the class deletes its tests", delCls.s === 200 && testGone.s === 404, { delCls: delCls.s, testGone: testGone.s })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
