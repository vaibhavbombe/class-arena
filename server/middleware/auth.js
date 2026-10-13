const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Role = require('../models/Role')
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
  const user = await User.findById(payload.userId).select('institutionId role name customRoleId')
  if (!user || user.institutionId.toString() !== payload.institutionId) {
    return { error: 'User no longer exists' }
  }

  // Permissions come from the database on every request, never from the token.
  let customRole = null
  if (user.role === 'teacher' && user.customRoleId) {
    customRole = await Role.findOne({ _id: user.customRoleId, institutionId: user.institutionId }).select('name permissions')
  }

  return {
    identity: {
      userId: user._id.toString(),
      institutionId: payload.institutionId,
      role: user.role,
      name: user.name,
      roleName: customRole?.name || user.role,
      permissions: resolvePermissions(user.role, customRole),
    },
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const { identity, error } = await authenticateToken(header.split(' ')[1])
  if (error) return res.status(401).json({ error })

  req.userId = identity.userId
  req.institutionId = identity.institutionId
  req.role = identity.role
  req.roleName = identity.roleName
  req.permissions = identity.permissions
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

module.exports = { authenticateToken, requireAuth, requireRole, requirePermission }
