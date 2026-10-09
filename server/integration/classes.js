// Classes: join codes, student signup, tenant and role isolation.
const { run, PW, call, check, finish } = require('./helpers')

async function teacherFor(adminToken, prefix) {
  const inv = await call('POST', '/api/invites', { email: `${prefix}${run}@example.com` }, adminToken)
  const token = new URL(inv.data.inviteUrl).searchParams.get('token')
  return (await call('POST', '/api/invites/accept', { token, name: `Teacher ${prefix}`, password: PW })).data.accessToken
}

;(async () => {
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Alpha', name: 'Admin A', email: `a${run}@example.com`, password: 'Passw0rd!x' })).data.accessToken
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Beta', name: 'Admin B', email: `b${run}@example.com`, password: 'Passw0rd!x' })).data.accessToken
  const T1 = await teacherFor(A, 't1-')
  const T2 = await teacherFor(A, 't2-')
  const TB = await teacherFor(B, 'tb-')

  const c1 = await call('POST', '/api/classes', { name: 'Physics 11', subject: 'Physics' }, T1)
  check('teacher creates class with 6-char code', c1.status === 201 && /^[A-Z2-9]{6}$/.test(c1.data.joinCode), c1)
  const cB = await call('POST', '/api/classes', { name: 'Beta Maths' }, TB)

  const s = await call('POST', '/api/auth/student-signup', { name: 'Stu', email: `s${run}@example.com`, password: 'Passw0rd!x', joinCode: c1.data.joinCode.toLowerCase().replace(/(...)/, '$1-') })
  check('student signs up with code (case/dash tolerant)', s.status === 201 && s.data.user.role === 'student', s)
  const S = s.data.accessToken
  const sMe = await call('GET', '/api/me', null, S)
  check('student lands in the class\'s institute', sMe.data.institution.name === 'Alpha', sMe)

  const badCode = await call('POST', '/api/auth/student-signup', { name: 'X', email: `x${run}@example.com`, password: 'Passw0rd!x', joinCode: 'ZZZZZZ' })
  check('unknown code -> 404', badCode.status === 404, badCode)

  const sClasses = await call('GET', '/api/classes', null, S)
  check('student sees enrolled class, no joinCode', sClasses.data.length === 1 && !('joinCode' in sClasses.data[0]), sClasses)
  const crossJoin = await call('POST', '/api/classes/join', { joinCode: cB.data.joinCode }, S)
  check('student cannot join other institute\'s class', crossJoin.status === 404, crossJoin)
  const dupJoin = await call('POST', '/api/classes/join', { joinCode: c1.data.joinCode }, S)
  check('joining same class twice -> 409', dupJoin.status === 409, dupJoin)

  const c2 = await call('POST', '/api/classes', { name: 'Chem 12' }, T2)
  const join2 = await call('POST', '/api/classes/join', { joinCode: c2.data.joinCode }, S)
  check('student joins second class in same institute', join2.status === 201, join2)

  const sCreate = await call('POST', '/api/classes', { name: 'Hack' }, S)
  check('student cannot create class (403)', sCreate.status === 403, sCreate)

  const t1List = await call('GET', '/api/classes', null, T1)
  check('teacher sees only own classes, with count', t1List.data.length === 1 && t1List.data[0].studentCount === 1, t1List)
  const t2View = await call('GET', `/api/classes/${c1.data.id}`, null, T2)
  check('other teacher cannot open class (404)', t2View.status === 404, t2View)
  const bView = await call('GET', `/api/classes/${c1.data.id}`, null, B)
  check('other institute admin cannot open class (404)', bView.status === 404, bView)
  const badId = await call('GET', '/api/classes/not-an-id', null, A)
  check('invalid id -> 404, not 500', badId.status === 404, badId)

  const aList = await call('GET', '/api/classes', null, A)
  check('admin sees all classes in own institute only', aList.data.length === 2 && aList.data.every((c) => c.name !== 'Beta Maths'), aList)
  const roster = await call('GET', `/api/classes/${c1.data.id}`, null, T1)
  check('teacher sees roster', roster.data.students?.length === 1 && roster.data.students[0].name === 'Stu', roster)
  const sView = await call('GET', `/api/classes/${c1.data.id}`, null, S)
  check('student class view has no roster/joinCode', sView.status === 200 && !sView.data.students && !sView.data.joinCode, sView)

  const regen = await call('POST', `/api/classes/${c1.data.id}/join-code`, null, T1)
  const oldCode = await call('POST', '/api/auth/student-signup', { name: 'Late', email: `l${run}@example.com`, password: 'Passw0rd!x', joinCode: c1.data.joinCode })
  check('regenerated code replaces old one', regen.data.joinCode !== c1.data.joinCode && oldCode.status === 404, { regen, oldCode })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
