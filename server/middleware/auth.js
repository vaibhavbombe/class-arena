const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.split(' ')[1]

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Still look the user up: a deleted user or a changed role takes effect
  // immediately instead of after the 15 minute token lifetime.
  const user = await User.findById(payload.userId).select('institutionId role')
  if (!user || user.institutionId.toString() !== payload.institutionId) {
    return res.status(401).json({ error: 'User no longer exists' })
  }

  req.userId = user._id.toString()
  req.institutionId = payload.institutionId
  req.role = user.role
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

module.exports = { requireAuth, requireRole }
