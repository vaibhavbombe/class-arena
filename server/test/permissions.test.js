const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const p = require('../lib/permissions')

test('built-in roles: admin has everything, students nothing, teachers the classic teacher set', () => {
  assert.deepEqual(p.resolvePermissions('admin'), p.ALL)
  assert.deepEqual(p.resolvePermissions('student'), [])
  assert.deepEqual(p.resolvePermissions('teacher').sort(), [...p.TEACHER_DEFAULT].sort())
  // Teachers never had institute-wide powers.
  for (const perm of ['members.view', 'members.invite', 'members.remove', 'roles.manage', 'classes.assign', 'classes.view_all']) {
    assert.equal(p.resolvePermissions('teacher').includes(perm), false, perm)
  }
})

test('a custom role gives a teacher exactly its permissions, never admin-only ones or unknown names', () => {
  const ta = { permissions: ['results.view', 'tests.manage'] }
  assert.deepEqual(p.resolvePermissions('teacher', ta), ['tests.manage', 'results.view'])
  const sneaky = { permissions: ['results.view', 'roles.manage', 'made.up'] }
  assert.deepEqual(p.resolvePermissions('teacher', sneaky), ['results.view'])
  // Custom roles only apply to teachers: an admin stays admin, a student stays a student.
  assert.deepEqual(p.resolvePermissions('admin', { permissions: [] }), p.ALL)
  assert.deepEqual(p.resolvePermissions('student', { permissions: ['tests.manage'] }), [])
})

test('can() checks a permission and refuses unknown names (typos fail loudly)', () => {
  const who = { permissions: p.resolvePermissions('teacher') }
  assert.equal(p.can(who, 'tests.manage'), true)
  assert.equal(p.can(who, 'members.invite'), false)
  assert.throws(() => p.can(who, 'tests.manag'), /Unknown permission/)
})

test('custom role input: names, reserved names, unknown and admin-only permissions', () => {
  const ok = p.parseRoleInput({ name: '  Teaching Assistant ', description: 'Grades tests', permissions: ['results.view', 'tests.manage', 'results.view'] })
  assert.deepEqual(ok.role, { name: 'Teaching Assistant', description: 'Grades tests', permissions: ['tests.manage', 'results.view'] })
  assert.match(p.parseRoleInput({ name: '', permissions: [] }).error, /name is required/)
  assert.match(p.parseRoleInput({ name: 'Admin', permissions: [] }).error, /built-in role name/)
  assert.match(p.parseRoleInput({ name: 'x'.repeat(41), permissions: [] }).error, /at most 40/)
  assert.match(p.parseRoleInput({ name: 'TA', permissions: ['delete.everything'] }).error, /Unknown permission/)
  assert.match(p.parseRoleInput({ name: 'TA', permissions: ['roles.manage'] }).error, /only belong to admins/)
  assert.match(p.parseRoleInput({ name: 'TA', permissions: 'all' }).error, /must be a list/)
})

test('every permission has a group and a label (the admin UI lists them)', () => {
  for (const [name, meta] of Object.entries(p.CATALOG)) {
    assert.ok(meta.group && meta.label, name)
    assert.match(name, /^[a-z]+\.[a-z_]+$/)
  }
})

test('routes: staff actions are checked by permission, not by role (audit of the source)', () => {
  const dir = path.join(__dirname, '..', 'routes')
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
    assert.doesNotMatch(source, /requireRole\('teacher', 'admin'\)|requireRole\('admin'\)/, `${file} still gates staff actions by role`)
    for (const [, name] of source.matchAll(/requirePermission\('([^']+)'\)/g)) assert.ok(p.CATALOG[name], `${file}: unknown permission ${name}`)
  }
})
