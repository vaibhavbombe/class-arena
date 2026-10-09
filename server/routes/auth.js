const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const User = require('../models/User')
const Institution = require('../models/Institution')
const RefreshToken = require('../models/RefreshToken')
const Class = require('../models/Class')
const Enrollment = require('../models/Enrollment')
const PasswordReset = require('../models/PasswordReset')
const { signAccessToken, issueRefreshToken, authResponse } = require('../lib/tokens')
const { rejectInvalid } = require('../lib/validate')
const { normalizeJoinCode } = require('../lib/joinCode')
const { sendMail } = require('../lib/mailer')

const router = express.Router()
const SALT_ROUNDS = 10
const RESET_TTL_MS = 30 * 60 * 1000 // 30 minutes
const RESET_COOLDOWN_MS = 60 * 1000 // at most one reset email per account per minute

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Signing up creates a brand new institute, and the signer becomes its admin.
// Teachers join by invite; students join with a class code (/student-signup).
router.post('/signup', async (req, res) => {
  if (rejectInvalid(res, req.body, ['email', 'password', 'name', 'institutionName'], { newPassword: true })) return
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

// Students don't need an invite: a class join code puts them in that class's
// institute. The institute comes from the class, never from the request.
router.post('/student-signup', async (req, res) => {
  if (rejectInvalid(res, req.body, ['email', 'password', 'name', 'joinCode'], { newPassword: true })) return
  const { email, password, name } = req.body

  const joinCode = normalizeJoinCode(req.body.joinCode)
  const cls = joinCode && await Class.findOne({ joinCode })
  if (!cls) return res.status(404).json({ error: 'No class found with that code' })

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  let user
  try {
    user = await User.create({ email, passwordHash, name, institutionId: cls.institutionId, role: 'student' })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists. Log in and join the class from your dashboard.' })
    throw err
  }
  await Enrollment.create({ institutionId: cls.institutionId, classId: cls._id, studentId: user._id })

  res.status(201).json({
    ...(await authResponse(user)),
    class: { id: cls._id, name: cls.name },
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

// Always answers the same way, whether or not the email has an account, so the form
// can't be used to find out who is registered. The email is sent in the background
// so the response time doesn't give it away either.
router.post('/forgot-password', async (req, res) => {
  if (rejectInvalid(res, req.body, ['email'])) return
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' })

  // The response is already sent, so errors are logged here instead of reaching the error handler.
  sendResetEmail(req.body.email.toLowerCase().trim())
    .catch((err) => console.error('Password reset failed:', err))
})

async function sendResetEmail(email) {
  const user = await User.findOne({ email })
  if (!user) return

  // Cooldown: don't let the form be used to flood someone's inbox.
  const recent = await PasswordReset.exists({ userId: user._id, createdAt: { $gt: new Date(Date.now() - RESET_COOLDOWN_MS) } })
  if (recent) return

  // Only the newest link works.
  await PasswordReset.deleteMany({ userId: user._id })
  const token = crypto.randomBytes(32).toString('hex')
  await PasswordReset.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) })

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`
  const delivery = await sendMail({
    to: user.email,
    subject: 'Reset your ClassArena password',
    text: `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n${resetUrl}\n\nIf you didn't ask for this, you can ignore this email; your password hasn't changed.`,
  })
  if (!delivery.sent) console.error('Password reset email not sent:', delivery.reason)
}

router.post('/reset-password', async (req, res) => {
  if (rejectInvalid(res, req.body, ['token', 'password'], { newPassword: true })) return
  const { token, password } = req.body

  // Claim the token atomically, so the same link can't be used twice.
  const reset = await PasswordReset.findOneAndUpdate(
    { tokenHash: hashToken(token), used: false, expiresAt: { $gt: new Date() } },
    { used: true },
  )
  if (!reset) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' })
  }

  const user = await User.findById(reset.userId)
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' })

  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  await user.save()
  // Sign out every existing session: whoever had access before the reset loses it.
  await RefreshToken.deleteMany({ userId: user._id })
  await PasswordReset.deleteMany({ userId: user._id })

  res.json({ message: 'Password updated. You can log in now.' })
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
