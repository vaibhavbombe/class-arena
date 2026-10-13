// Custom roles and permissions (IAM): creating roles, assigning them, the read-only
// "all classes" scope, escalation guards, and changes applying on the next request.
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'IAM', name: 'Admin', email: `iam-a${run}@example.com`, password: PW })).d
  const [owner, ta, hod, recruiter] = [await invite(A.accessToken, 'iam-owner-'), await invite(A.accessToken, 'iam-ta-'), await invite(A.accessToken, 'iam-hod-'), await invite(A.accessToken, 'iam-rec-')]
  const other = (await call('POST', '/api/auth/signup', { institutionName: 'Other IAM', name: 'Other', email: `iam-o${run}@example.com`, password: PW })).d
  const me = async (T) => (await call('GET', '/api/me', null, T.accessToken)).d

  // A class and a test owned by "owner" (a normal teacher).
  const cls = (await call('POST', '/api/classes', { name: 'Owned class' }, owner.accessToken)).d
  const q = (await call('POST', '/api/questions', { type: 'mcq', prompt: '1 + 1?', options: [{ text: '2', correct: true }, { text: '3' }] }, owner.accessToken)).d
  const t = (await call('POST', '/api/tests', { classId: cls.id, title: 'Owned test' }, owner.accessToken)).d
  await call('PUT', `/api/tests/${t.id}`, { items: [{ questionId: q._id, points: 1 }] }, owner.accessToken)

  // --- creating roles
  check('teachers cannot manage roles', (await call('GET', '/api/roles', null, owner.accessToken)).s === 403, null)
  const catalog = (await call('GET', '/api/roles/catalog', null, A.accessToken)).d
  check('the catalog lists every permission with a label; roles.manage is admin-only', catalog.permissions.length >= 16 && catalog.permissions.find((p) => p.name === 'roles.manage').adminOnly === true, catalog.permissions.length)
  const adminOnly = await call('POST', '/api/roles', { name: 'Sneaky', permissions: ['roles.manage'] }, A.accessToken)
  check('a custom role cannot contain an admin-only permission', adminOnly.s === 400 && /only belong to admins/.test(adminOnly.d.error), adminOnly.d)
  const builtInName = await call('POST', '/api/roles', { name: 'Teacher', permissions: [] }, A.accessToken)
  check('built-in role names are reserved', builtInName.s === 400, builtInName.d)
  const taRole = (await call('POST', '/api/roles', { name: 'Teaching Assistant', description: 'Grades tests', permissions: ['results.view', 'results.release'] }, A.accessToken))
  check('admin creates a "Teaching Assistant" role', taRole.s === 201 && taRole.d.permissions.join() === 'results.view,results.release', taRole.d)
  const dupe = await call('POST', '/api/roles', { name: 'teaching assistant', permissions: [] }, A.accessToken)
  check('role names are unique per institute (case-insensitive)', dupe.s === 409, dupe.d)

  // --- assigning roles changes access on the very next request
  check('before: a teacher has the classic teacher permissions', (await me(ta)).permissions.includes('classes.create'), null)
  const assigned = await call('PUT', `/api/members/${ta.user.id}/role`, { roleId: taRole.d.id }, A.accessToken)
  const taMe = await me(ta)
  check('after assignment the same token has exactly the role\'s permissions', assigned.s === 200 && taMe.roleName === 'Teaching Assistant' && taMe.permissions.join() === 'results.view,results.release', taMe)
  check('...so creating a class is now refused', (await call('POST', '/api/classes', { name: 'Nope' }, ta.accessToken)).s === 403, null)
  check('...and so is the question bank', (await call('GET', '/api/questions', null, ta.accessToken)).s === 403, null)
  check('admins and students cannot be given a custom role', (await call('PUT', `/api/members/${A.user.id}/role`, { roleId: taRole.d.id }, A.accessToken)).s === 400, null)
  check('roles from another institute cannot be assigned', (await call('PUT', `/api/members/${ta.user.id}/role`, { roleId: taRole.d.id }, other.accessToken)).s === 404, null)

  await call('PUT', `/api/roles/${taRole.d.id}`, { name: 'Teaching Assistant', permissions: ['results.view'] }, A.accessToken)
  check('editing a role applies to its members immediately', (await me(ta)).permissions.join() === 'results.view', null)
  const members = (await call('GET', '/api/members', null, A.accessToken)).d
  check('the member list shows each member\'s role name', members.find((m) => m._id === ta.user.id)?.roleName === 'Teaching Assistant', members.map((m) => m.roleName))

  // --- read-only "all classes" scope (Head of Department), even with a write permission
  const hodRole = (await call('POST', '/api/roles', { name: 'Head of Department', permissions: ['classes.view_all', 'results.view', 'analytics.view', 'tests.manage'] }, A.accessToken)).d
  await call('PUT', `/api/members/${hod.user.id}/role`, { roleId: hodRole.id }, A.accessToken)
  const hodClasses = (await call('GET', '/api/classes', null, hod.accessToken)).d
  check('Head of Department sees every class in the institute', hodClasses.some((c) => c.id === cls.id), hodClasses.map((c) => c.name))
  check('...can open another teacher\'s class, its analytics and its test results', (await call('GET', `/api/classes/${cls.id}`, null, hod.accessToken)).s === 200 && (await call('GET', `/api/classes/${cls.id}/analytics`, null, hod.accessToken)).s === 200 && (await call('GET', `/api/tests/${t.id}/results`, null, hod.accessToken)).s === 200, null)
  const editOthers = await call('PUT', `/api/tests/${t.id}`, { title: 'Hijacked' }, hod.accessToken)
  const createInOthers = await call('POST', '/api/tests', { classId: cls.id, title: 'Sneaky test' }, hod.accessToken)
  check('...but cannot change another teacher\'s test or add one to their class (read-only scope)', editOthers.s === 404 && createInOthers.s === 404, { edit: editOthers.s, create: createInOthers.s })
  check('a normal teacher still cannot see other teachers\' classes', (await call('GET', `/api/classes/${cls.id}`, null, ta.accessToken)).s === 404, null)

  // --- delegated member management cannot escalate
  const recRole = (await call('POST', '/api/roles', { name: 'Recruiter', permissions: ['members.view', 'members.invite', 'members.remove'] }, A.accessToken)).d
  await call('PUT', `/api/members/${recruiter.user.id}/role`, { roleId: recRole.id }, A.accessToken)
  check('a delegated recruiter can list members and invite a teacher', (await call('GET', '/api/members', null, recruiter.accessToken)).s === 200 && (await call('POST', '/api/invites', { email: `iam-new${run}@example.com`, role: 'teacher' }, recruiter.accessToken)).s === 201, null)
  const inviteAdmin = await call('POST', '/api/invites', { email: `iam-boss${run}@example.com`, role: 'admin' }, recruiter.accessToken)
  const removeAdmin = await call('DELETE', `/api/members/${A.user.id}`, null, recruiter.accessToken)
  check('...but cannot invite an admin or remove one (no privilege escalation)', inviteAdmin.s === 403 && removeAdmin.s === 403, { inviteAdmin: inviteAdmin.d, removeAdmin: removeAdmin.d })
  check('...and cannot manage roles', (await call('POST', '/api/roles', { name: 'Self-promotion', permissions: ['members.remove'] }, recruiter.accessToken)).s === 403, null)

  // --- deleting roles
  const inUse = await call('DELETE', `/api/roles/${taRole.d.id}`, null, A.accessToken)
  check('a role that is still assigned cannot be deleted', inUse.s === 409, inUse.d)
  await call('PUT', `/api/members/${ta.user.id}/role`, { roleId: null }, A.accessToken)
  check('clearing the role gives the teacher the built-in teacher permissions back', (await me(ta)).permissions.includes('classes.create'), null)
  check('an unused role can be deleted', (await call('DELETE', `/api/roles/${taRole.d.id}`, null, A.accessToken)).s === 200, null)
  const roles = (await call('GET', '/api/roles', null, A.accessToken)).d
  check('roles list member counts; other institutes see none of them', roles.find((r) => r.name === 'Head of Department')?.memberCount === 1 && (await call('GET', '/api/roles', null, other.accessToken)).d.length === 0, roles)

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
