const jwt = require('jsonwebtoken')
const User = require('../models/User')

// Verifies an access token and loads who it belongs to. Shared by HTTP requests and
// Socket.io connections. Returns { identity } or { error }.
async function authenticateToken(token) {
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
  } catch {
    return { error: 'Invalid or expired token' }
  }

  // Still look the user up: a deleted user or a changed role takes effect
  // immediately instead of after the 15 minute token lifetime.
  const user = await User.findById(payload.userId).select('institutionId role name')
  if (!user || user.institutionId.toString() !== payload.institutionId) {
    return { error: 'User no longer exists' }
  }

  return {
    identity: { userId: user._id.toString(), institutionId: payload.institutionId, role: user.role, name: user.name },
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
  next()
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' })
    }

    next()
  }
}

module.exports = { authenticateToken, requireAuth, requireRole }
