const express = require('express')
const bcrypt = require('bcrypt')
const User = require('../models/User')
const Institution = require('../models/Institution')
const RefreshToken = require('../models/RefreshToken')
const { signAccessToken, issueRefreshToken, authResponse } = require('../lib/tokens')
const { rejectInvalid } = require('../lib/validate')

const router = express.Router()
const SALT_ROUNDS = 10

// Signing up creates a brand new institute, and the signer becomes its admin.
// Teachers join by invite; students join with a class code (/student-signup).
router.post('/signup', async (req, res) => {
  if (rejectInvalid(res, req.body, ['email', 'password', 'name', 'institutionName'])) return
  const { email, password, name, institutionName } = req.body

  const existing = await User.findOne({ email: email.toLowerCase().trim() })
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const institution = await Institution.create({ name: institutionName })
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  let user
  try {
    user = await User.create({ email, passwordHash, name, institutionId: institution._id, role: 'admin' })
  } catch (err) {
    // Lost a race with another signup for the same email: don't leave an empty institute behind.
    await Institution.deleteOne({ _id: institution._id })
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' })
    throw err
  }

  res.status(201).json({
    ...(await authResponse(user)),
    institution: { id: institution._id, name: institution.name },
  })
})

router.post('/login', async (req, res) => {
  if (rejectInvalid(res, req.body, ['email', 'password'])) return
  const { email, password } = req.body

  const user = await User.findOne({ email: email.toLowerCase().trim() })
  // Same error for "no such user" and "wrong password", so emails can't be probed.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  res.json(await authResponse(user))
})

router.post('/refresh', async (req, res) => {
  if (rejectInvalid(res, req.body, ['refreshToken'])) return

  // Rotation: each refresh token is single-use. findOneAndDelete is atomic, so two
  // parallel requests with the same token can't both get new tokens.
  const stored = await RefreshToken.findOneAndDelete({ token: req.body.refreshToken })
  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' })
  }

  // Reload the user so the new access token carries their current institute and role.
  const user = await User.findById(stored.userId)
  if (!user) return res.status(401).json({ error: 'User no longer exists' })

  res.json({ accessToken: signAccessToken(user), refreshToken: await issueRefreshToken(user._id) })
})

router.post('/logout', async (req, res) => {
  const refreshToken = req.body?.refreshToken
  if (typeof refreshToken === 'string' && refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken })
  }
  res.json({ message: 'Logged out' })
})

module.exports = router
module.exports.SALT_ROUNDS = SALT_ROUNDS
