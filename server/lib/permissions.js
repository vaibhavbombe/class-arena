// Permissions: what a signed-in person may do. Pure functions, unit-tested in
// test/permissions.test.js.
//
// Two separate ideas:
//   persona (user.role): admin | teacher | student. Decides *data scope*: the whole institute,
//            the classes you teach, or the classes you're enrolled in. Unchanged by custom roles.
//   permissions: *actions*. Admins have all of them; a teacher has the built-in teacher set,
//            or the set of the custom role an admin assigned them; students have none (their
//            own actions, like taking a test, are checked by persona).

const CATALOG = {
  'members.view': { group: 'Institute', label: 'See the member list' },
  'members.invite': { group: 'Institute', label: 'Invite teachers' },
  'members.remove': { group: 'Institute', label: 'Remove members' },
  'roles.manage': { group: 'Institute', label: 'Create roles and assign them', adminOnly: true },
  'classes.create': { group: 'Classes', label: 'Create classes' },
  'classes.manage': { group: 'Classes', label: 'Manage own classes (join code, students, delete)' },
  'classes.assign': { group: 'Classes', label: 'Move a class to another teacher' },
  'classes.view_all': { group: 'Classes', label: 'See every class in the institute (read-only)' },
  'questions.manage': { group: 'Content', label: 'Use the question bank' },
  'questions.generate': { group: 'Content', label: 'Generate questions with AI' },
  'tests.manage': { group: 'Content', label: 'Create, edit, publish and delete tests' },
  'results.view': { group: 'Results', label: 'See test results' },
  'results.release': { group: 'Results', label: 'Release results to students' },
  'live.host': { group: 'Live & coding', label: 'Create and host live quizzes' },
  'coding.manage': { group: 'Live & coding', label: 'Manage coding problems and contests' },
  'analytics.view': { group: 'Results', label: 'See class analytics' },
}

const ALL = Object.freeze(Object.keys(CATALOG))
const ADMIN_ONLY = Object.freeze(ALL.filter((p) => CATALOG[p].adminOnly))
// What every teacher could do before custom roles existed (kept identical on purpose).
const TEACHER_DEFAULT = Object.freeze([
  'classes.create', 'classes.manage', 'questions.manage', 'questions.generate', 'tests.manage',
  'results.view', 'results.release', 'live.host', 'coding.manage', 'analytics.view',
])

/**
 * @param role        the user's persona: 'admin' | 'teacher' | 'student'
 * @param customRole  the assigned custom role ({ permissions }) or null; only used for teachers
 * @returns a sorted array of permission names
 */
function resolvePermissions(role, customRole = null) {
  if (role === 'admin') return [...ALL]
  if (role !== 'teacher') return []
  if (!customRole) return [...TEACHER_DEFAULT]
  // Unknown names (e.g. from an older catalog) and admin-only powers are ignored, never granted.
  return ALL.filter((p) => customRole.permissions.includes(p) && !ADMIN_ONLY.includes(p))
}

function can(who, permission) {
  if (!CATALOG[permission]) throw new Error(`Unknown permission: ${permission}`)
  return Array.isArray(who.permissions) ? who.permissions.includes(permission) : Boolean(who.permissions?.has?.(permission))
}

const LIMITS = { name: 40, description: 200, maxRoles: 30 }
const RESERVED = ['admin', 'teacher', 'student']

// Validates a custom role from an admin. Returns { role } or { error }.
function parseRoleInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body is required' }
  const { name, description = '', permissions } = body
  if (typeof name !== 'string' || !name.trim()) return { error: 'name is required' }
  if (name.trim().length > LIMITS.name) return { error: `name can be at most ${LIMITS.name} characters` }
  if (RESERVED.includes(name.trim().toLowerCase())) return { error: `"${name.trim()}" is a built-in role name` }
  if (typeof description !== 'string' || description.length > LIMITS.description) return { error: `description can be at most ${LIMITS.description} characters` }
  if (!Array.isArray(permissions)) return { error: 'permissions must be a list' }
  for (const p of permissions) {
    if (typeof p !== 'string' || !CATALOG[p]) return { error: `Unknown permission: ${String(p)}` }
    if (ADMIN_ONLY.includes(p)) return { error: `${p} can only belong to admins` }
  }
  return { role: { name: name.trim(), description: description.trim(), permissions: ALL.filter((p) => permissions.includes(p)) } }
}

module.exports = { CATALOG, ALL, ADMIN_ONLY, TEACHER_DEFAULT, resolvePermissions, can, parseRoleInput, LIMITS }
