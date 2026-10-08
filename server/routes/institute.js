const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const User = require('../models/User')
const Institution = require('../models/Institution')
const Invite = require('../models/Invite')
const { requireAuth, requireRole } = require('../middleware/auth')
const { authResponse, publicUser } = require('../lib/tokens')
const { rejectInvalid } = require('../lib/validate')
const { sendMail } = require('../lib/mailer')
const { SALT_ROUNDS } = require('./auth')

const router = express.Router()

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId)
  const institution = await Institution.findById(req.institutionId)
  res.json({ user: publicUser(user), institution: { id: institution._id, name: institution.name } })
})

// Only ever returns users from the caller's own institute (req.institutionId
// comes from the verified token, never from anything the client sends).
router.get('/members', requireAuth, requireRole('admin'), async (req, res) => {
  const filter = { institutionId: req.institutionId }
  if (User.ROLES.includes(req.query.role)) filter.role = req.query.role
  const members = await User.find(filter).select('-passwordHash').sort({ role: 1, name: 1 })
  res.json(members)
})

// Admins invite teachers (or co-admins). Students never need an invite.
router.post('/invites', requireAuth, requireRole('admin'), async (req, res) => {
  if (rejectInvalid(res, req.body, ['email'])) return
  const email = req.body.email.toLowerCase().trim()
  const role = req.body.role === 'admin' ? 'admin' : 'teacher'

  const existing = await User.findOne({ email })
  if (existing) {
    return res.status(409).json({ error: 'This email already has an account' })
  }

  const token = crypto.randomBytes(24).toString('hex')
  await Invite.create({
    email,
    institutionId: req.institutionId,
    invitedBy: req.userId,
    token,
    role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  })

  const institution = await Institution.findById(req.institutionId)
  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite?token=${token}`
  const emailSent = await sendMail({
    to: email,
    subject: `You've been invited to ${institution.name} on ClassArena`,
    text: `You've been invited to join ${institution.name} as a ${role}. Accept here: ${inviteUrl}`,
  })

  // The admin sees the link too, so they can share it by hand if the email doesn't arrive.
  res.status(201).json({
    message: emailSent ? 'Invite sent' : 'Invite created, but the email could not be sent. Share the link manually.',
    emailSent,
    inviteUrl,
  })
})

// No auth here: the person accepting doesn't have an account yet.
router.post('/invites/accept', async (req, res) => {
  if (rejectInvalid(res, req.body, ['token', 'password', 'name'])) return
  const { token, password, name } = req.body

  // Mark the invite used atomically, so one invite can't create two accounts.
  const invite = await Invite.findOneAndUpdate(
    { token, used: false, expiresAt: { $gt: new Date() } },
    { used: true },
  )
  if (!invite) {
    return res.status(400).json({ error: 'This invite is invalid or has expired' })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  let user
  try {
    user = await User.create({
      email: invite.email, passwordHash, name,
      institutionId: invite.institutionId,
      role: invite.role,
    })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' })
    }
    // Something unexpected: give the invite back so it can be retried.
    await Invite.updateOne({ _id: invite._id }, { used: false })
    throw err
  }

  res.status(201).json(await authResponse(user))
})

module.exports = router
