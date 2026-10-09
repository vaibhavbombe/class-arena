// Member and class management: remove member, change teacher, remove student, delete class.
const { run, PW, call, check, invite, finish } = require('./helpers')

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin A', email: `ma${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `mb${run}@example.com`, password: PW })).d
  const T1 = await invite(A.accessToken, 't1-')
  const T2 = await invite(A.accessToken, 't2-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T1.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'Stu', email: `ms${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const S2 = (await call('POST', '/api/auth/student-signup', { name: 'Stu2', email: `ms2${run}@example.com`, password: PW, joinCode: cls.joinCode })).d

  // --- remove member
  const self = await call('DELETE', `/api/members/${A.user.id}`, null, A.accessToken)
  check('admin cannot remove themselves (400)', self.s === 400, self)
  const busy = await call('DELETE', `/api/members/${T1.user.id}`, null, A.accessToken)
  check('teacher with classes cannot be removed (409, says how many)', busy.s === 409 && busy.d.error.includes('1 class'), busy)
  const byTeacher = await call('DELETE', `/api/members/${S.user.id}`, null, T1.accessToken)
  check('teacher cannot remove members (403)', byTeacher.s === 403, byTeacher)
  const cross = await call('DELETE', `/api/members/${S.user.id}`, null, B.accessToken)
  check('other institute admin cannot remove (404)', cross.s === 404, cross)
  const badId = await call('DELETE', '/api/members/not-an-id', null, A.accessToken)
  check('invalid member id -> 404', badId.s === 404, badId)

  // --- change teacher
  const toStudent = await call('PATCH', `/api/classes/${cls.id}/teacher`, { teacherId: S.user.id }, A.accessToken)
  check('cannot make a student the teacher (400)', toStudent.s === 400, toStudent)
  const toOtherInst = await call('PATCH', `/api/classes/${cls.id}/teacher`, { teacherId: B.user.id }, A.accessToken)
  check('cannot assign a teacher from another institute (400)', toOtherInst.s === 400, toOtherInst)
  const byT = await call('PATCH', `/api/classes/${cls.id}/teacher`, { teacherId: T2.user.id }, T1.accessToken)
  check('teacher cannot reassign classes (403)', byT.s === 403, byT)
  const moved = await call('PATCH', `/api/classes/${cls.id}/teacher`, { teacherId: T2.user.id }, A.accessToken)
  check('admin hands class to another teacher', moved.s === 200 && moved.d.teacher.name === 't2-', moved)
  const t1View = await call('GET', `/api/classes/${cls.id}`, null, T1.accessToken)
  const t2View = await call('GET', `/api/classes/${cls.id}`, null, T2.accessToken)
  check('old teacher loses access, new teacher gains it', t1View.s === 404 && t2View.s === 200, { t1: t1View.s, t2: t2View.s })
  const freed = await call('DELETE', `/api/members/${T1.user.id}`, null, A.accessToken)
  check('teacher without classes can be removed', freed.s === 200, freed)
  const t1Login = await call('POST', '/api/auth/login', { email: `t1-${run}@example.com`, password: PW })
  const t1Refresh = await call('POST', '/api/auth/refresh', { refreshToken: T1.refreshToken })
  const t1Token = await call('GET', '/api/me', null, T1.accessToken)
  check('removed teacher: login, refresh and old token all fail', t1Login.s === 401 && t1Refresh.s === 401 && t1Token.s === 401, { login: t1Login.s, refresh: t1Refresh.s, me: t1Token.s })

  // --- remove student from class
  const sByOther = await call('DELETE', `/api/classes/${cls.id}/students/${S2.user.id}`, null, B.accessToken)
  check('other institute cannot remove a student from the class (404)', sByOther.s === 404, sByOther)
  const sOut = await call('DELETE', `/api/classes/${cls.id}/students/${S2.user.id}`, null, T2.accessToken)
  const s2Classes = await call('GET', '/api/classes', null, S2.accessToken)
  check('teacher removes student from class; student account stays', sOut.s === 200 && s2Classes.s === 200 && s2Classes.d.length === 0, { sOut, s2Classes })
  const sAgain = await call('DELETE', `/api/classes/${cls.id}/students/${S2.user.id}`, null, T2.accessToken)
  check('removing a student who is not in the class -> 404', sAgain.s === 404, sAgain)

  // --- remove a student entirely
  const goneStudent = await call('DELETE', `/api/members/${S.user.id}`, null, A.accessToken)
  const roster = await call('GET', `/api/classes/${cls.id}`, null, T2.accessToken)
  check('removed student disappears from the roster', goneStudent.s === 200 && roster.d.studentCount === 0, { goneStudent, roster: roster.d.studentCount })

  // --- delete class
  const delByStudent = await call('DELETE', `/api/classes/${cls.id}`, null, S2.accessToken)
  check('student cannot delete a class (403)', delByStudent.s === 403, delByStudent)
  const delByB = await call('DELETE', `/api/classes/${cls.id}`, null, B.accessToken)
  check('other institute cannot delete the class (404)', delByB.s === 404, delByB)
  const del = await call('DELETE', `/api/classes/${cls.id}`, null, T2.accessToken)
  const after = await call('GET', `/api/classes/${cls.id}`, null, A.accessToken)
  const oldCode = await call('POST', '/api/classes/join', { joinCode: cls.joinCode }, S2.accessToken)
  check('teacher deletes class; it and its join code are gone', del.s === 200 && after.s === 404 && oldCode.s === 404, { del: del.s, after: after.s, oldCode: oldCode.s })
  const t2Free = await call('DELETE', `/api/members/${T2.user.id}`, null, A.accessToken)
  check('after deleting their class, the teacher can be removed', t2Free.s === 200, t2Free)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
