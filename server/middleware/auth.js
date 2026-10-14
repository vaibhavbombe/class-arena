const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Role = require('../models/Role')
const Institution = require('../models/Institution')
const { resolvePermissions } = require('../lib/permissions')

// Verifies an access token and loads who it belongs to. Shared by HTTP requests and
// Socket.io connections. Returns { identity } or { error }.
async function authenticateToken(token) {
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
  } catch {
    return { error: 'Invalid or expired token' }
  }

  // Still look the user up: a deleted user, a changed role or changed permissions take effect
  // immediately instead of after the 15 minute token lifetime.
  const user = await User.findById(payload.userId).select('institutionId role name customRoleId mfa.enabled')
  if (!user || user.institutionId.toString() !== payload.institutionId) {
    return { error: 'User no longer exists' }
  }

  // Permissions come from the database on every request, never from the token.
  let customRole = null
  if (user.role === 'teacher' && user.customRoleId) {
    customRole = await Role.findOne({ _id: user.customRoleId, institutionId: user.institutionId }).select('name permissions')
  }

  // The institute can require staff to use two-factor login. Until they set it up, they may only
  // reach the 2FA setup routes (see requireAuth). Checked per request, so turning the policy on
  // applies at once. Only staff without 2FA need the extra lookup.
  const mfaSetupRequired = user.role !== 'student' && !user.mfa?.enabled &&
    Boolean(await Institution.exists({ _id: user.institutionId, requireStaffMfa: true }))

  return {
    identity: {
      mfaSetupRequired,
      userId: user._id.toString(),
      institutionId: payload.institutionId,
      role: user.role,
      name: user.name,
      roleName: customRole?.name || user.role,
      permissions: resolvePermissions(user.role, customRole),
    },
  }
}

// Fails closed: a staff member who still has to set up 2FA is refused everywhere, except on the
// few routes that opt in with requireAuthDuringMfaSetup (2FA setup itself and /api/me).
const requireAuth = makeRequireAuth({ allowMfaSetup: false })
const requireAuthDuringMfaSetup = makeRequireAuth({ allowMfaSetup: true })

function makeRequireAuth({ allowMfaSetup }) {
  return (req, res, next) => authenticateRequest(req, res, next, allowMfaSetup)
}

async function authenticateRequest(req, res, next, allowMfaSetup) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const { identity, error } = await authenticateToken(header.split(' ')[1])
  if (error) return res.status(401).json({ error })
  if (identity.mfaSetupRequired && !allowMfaSetup) {
    return res.status(403).json({ error: 'Your institute requires two-factor login. Set it up on the Security page first.', code: 'MFA_SETUP_REQUIRED' })
  }

  req.userId = identity.userId
  req.institutionId = identity.institutionId
  req.role = identity.role
  req.roleName = identity.roleName
  req.permissions = identity.permissions
  req.mfaSetupRequired = identity.mfaSetupRequired
  next()
}

// Persona checks (admin / teacher / student): used for things only that kind of user does,
// such as a student taking a test.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' })
    }

    next()
  }
}

// Action checks: the user needs this permission (lib/permissions.js).
function requirePermission(permission) {
  const { CATALOG } = require('../lib/permissions')
  if (!CATALOG[permission]) throw new Error(`Unknown permission: ${permission}`) // fail at startup, not at request time
  return (req, res, next) => {
    if (!req.permissions?.includes(permission)) {
      return res.status(403).json({ error: 'You do not have permission to do this' })
    }
    next()
  }
}

module.exports = { authenticateToken, requireAuth, requireAuthDuringMfaSetup, requireRole, requirePermission }
