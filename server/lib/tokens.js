const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const RefreshToken = require('../models/RefreshToken')

// The tenant (institutionId) and role travel in the signed token, so the server
// never has to trust a tenant id sent in the body, query or URL.
function signAccessToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), institutionId: user.institutionId.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  )
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex')
  await RefreshToken.create({
    userId,
    token,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  })
  return token
}

function publicUser(user) {
  return { id: user._id, email: user.email, name: user.name, role: user.role, institutionId: user.institutionId }
}

// Shape returned by every endpoint that logs someone in.
async function authResponse(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await issueRefreshToken(user._id),
    user: publicUser(user),
  }
}

module.exports = { signAccessToken, issueRefreshToken, publicUser, authResponse }
