// Auth: institute signup, roles, invites, token refresh, tenant isolation.
const { BASE, run, call, check, finish } = require('./helpers')

;(async () => {
  const a = await call('POST', '/api/auth/signup', { institutionName: 'Alpha Academy', name: 'Admin A', email: `a${run}@example.com`, password: 'Passw0rd!x' })
  check('signup creates admin', a.status === 201 && a.data.user.role === 'admin' && a.data.institution.name === 'Alpha Academy', a)
  const b = await call('POST', '/api/auth/signup', { institutionName: 'Beta School', name: 'Admin B', email: `b${run}@example.com`, password: 'Passw0rd!x' })

  const payload = JSON.parse(Buffer.from(a.data.accessToken.split('.')[1], 'base64url'))
  check('JWT carries institutionId + role', payload.institutionId === String(a.data.institution.id) && payload.role === 'admin', payload)

  const inj = await call('POST', '/api/auth/login', { email: { $gt: '' }, password: 'Passw0rd!x' })
  check('login rejects object email (NoSQL injection)', inj.status === 400, inj)

  const inv = await call('POST', '/api/invites', { email: `t${run}@example.com`, role: 'teacher' }, a.data.accessToken)
  check('admin can invite teacher', inv.status === 201 && inv.data.inviteUrl, inv)
  const token = new URL(inv.data.inviteUrl).searchParams.get('token')

  const t = await call('POST', '/api/invites/accept', { token, name: 'Teacher T', password: 'Passw0rd!x' })
  check('accept invite creates teacher', t.status === 201 && t.data.user.role === 'teacher', t)
  const again = await call('POST', '/api/invites/accept', { token, name: 'Teacher T', password: 'Passw0rd!x' })
  check('invite cannot be reused', again.status === 400, again)

  const tInv = await call('POST', '/api/invites', { email: `x${run}@example.com` }, t.data.accessToken)
  check('teacher cannot invite (403)', tInv.status === 403, tInv)
  const tMem = await call('GET', '/api/members', null, t.data.accessToken)
  check('teacher cannot list members (403)', tMem.status === 403, tMem)

  const members = await call('GET', '/api/members', null, a.data.accessToken)
  const emails = members.data.map((m) => m.email)
  check('admin A sees own admin + teacher', members.status === 200 && emails.length === 2 && emails.includes(`t${run}@example.com`), members)
  check('admin A does not see institute B', !emails.includes(`b${run}@example.com`), emails)
  check('no passwordHash in member list', members.data.every((m) => !('passwordHash' in m)), members.data[0])

  const me = await call('GET', '/api/me', null, t.data.accessToken)
  check('/me returns teacher in Alpha Academy', me.data.user.role === 'teacher' && me.data.institution.name === 'Alpha Academy', me)

  const r1 = await call('POST', '/api/auth/refresh', { refreshToken: a.data.refreshToken })
  check('refresh issues new tokens', r1.status === 200 && r1.data.accessToken && r1.data.refreshToken, r1)
  const r2 = await call('POST', '/api/auth/refresh', { refreshToken: a.data.refreshToken })
  check('old refresh token rejected after rotation', r2.status === 401, r2)

  const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })
  check('malformed JSON -> 400, no stack', bad.status === 400 && !(await bad.text()).includes('at '), bad.status)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
