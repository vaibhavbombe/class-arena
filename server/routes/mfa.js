const express = require('express')
const bcrypt = require('bcrypt')
const User = require('../models/User')
const { requireAuth } = require('../middleware/auth')
const totp = require('../lib/totp')
const secretBox = require('../lib/secretBox')
const { makeRecoveryCodes, consumeSecondFactor } = require('../lib/mfa')
const { blockedBy, recordFailure, clear, tooMany } = require('../lib/rateLimit')
const LIMITS = require('../lib/limits')

// Two-factor login settings for the signed-in user (authenticator app + recovery codes).
// Turning it on or off asks for the password again, so someone with a moment at a logged-in
// browser can't lock the owner out by enrolling their own phone.
const router = express.Router()
router.use(requireAuth)

const notConfigured = (res) => res.status(503).json({ error: 'Two-factor login is not available on this server yet' })

async function passwordMatches(user, password) {
  return typeof password === 'string' && password.length > 0 && bcrypt.compare(password, user.passwordHash)
}

// Wrong codes are limited per user (lib/limits.js), shared with the login step later.
async function checkFactor(req, res, user, code) {
  const rules = [{ ...LIMITS.mfa.wrongCodesPerUser, id: req.userId }]
  const wait = await blockedBy(rules)
  if (wait) {
    tooMany(res, wait, 'Too many wrong codes.')
    return false
  }
  return { rules }
}

router.get('/', async (req, res) => {
  const user = await User.findById(req.userId).select('mfa.enabled mfa.recoveryCodes mfa.enabledAt')
  res.json({ available: secretBox.isConfigured(), enabled: Boolean(user.mfa?.enabled), enabledAt: user.mfa?.enabledAt || null, recoveryCodesLeft: user.mfa?.recoveryCodes?.length || 0 })
})

// Step 1 of turning it on: a new secret for the authenticator app (QR code or typed in).
router.post('/setup', async (req, res) => {
  if (!secretBox.isConfigured()) return notConfigured(res)
  const user = await User.findById(req.userId)
  if (user.mfa?.enabled) return res.status(409).json({ error: 'Two-factor login is already on' })
  if (!(await passwordMatches(user, req.body?.password))) return res.status(400).json({ error: 'Your password is not correct' })
  const secret = totp.generateSecret()
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecret': secretBox.encrypt(secret) } })
  res.json({ secret, otpauthUrl: totp.otpauthUrl({ secret, account: user.email }) })
})

// Step 2: the first code from the app proves it's set up; then it's on, and the recovery codes
// are shown once (only their hashes are kept).
router.post('/enable', async (req, res) => {
  if (!secretBox.isConfigured()) return notConfigured(res)
  const user = await User.findById(req.userId)
  if (user.mfa?.enabled) return res.status(409).json({ error: 'Two-factor login is already on' })
  if (!user.mfa?.pendingSecret) return res.status(400).json({ error: 'Start the setup first' })
  const limited = await checkFactor(req, res, user)
  if (!limited) return
  const counter = totp.verify(secretBox.decrypt(user.mfa.pendingSecret), String(req.body?.code ?? ''))
  if (counter === null) {
    await recordFailure(limited.rules)
    return res.status(400).json({ error: "That code isn't right. Check the time on your phone and try the newest code." })
  }
  await clear(limited.rules[0].name, limited.rules[0].id)
  const { codes, hashes } = makeRecoveryCodes()
  await User.updateOne({ _id: user._id, 'mfa.enabled': { $ne: true } }, {
    $set: { 'mfa.enabled': true, 'mfa.secret': user.mfa.pendingSecret, 'mfa.pendingSecret': null, 'mfa.lastStep': counter, 'mfa.recoveryCodes': hashes, 'mfa.enabledAt': new Date() },
  })
  res.json({ enabled: true, recoveryCodes: codes })
})

// Turning it off needs the password and a current code (or a recovery code).
router.post('/disable', async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user.mfa?.enabled) return res.status(409).json({ error: 'Two-factor login is already off' })
  if (!(await passwordMatches(user, req.body?.password))) return res.status(400).json({ error: 'Your password is not correct' })
  const limited = await checkFactor(req, res, user)
  if (!limited) return
  if (!(await consumeSecondFactor(user, req.body?.code)).ok) {
    await recordFailure(limited.rules)
    return res.status(400).json({ error: "That code isn't right" })
  }
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.enabled': false, 'mfa.secret': null, 'mfa.pendingSecret': null, 'mfa.lastStep': -1, 'mfa.recoveryCodes': [], 'mfa.enabledAt': null } })
  res.json({ enabled: false })
})

// New recovery codes (the old ones stop working), after a current code.
router.post('/recovery-codes', async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user.mfa?.enabled) return res.status(409).json({ error: 'Turn on two-factor login first' })
  const limited = await checkFactor(req, res, user)
  if (!limited) return
  if (!(await consumeSecondFactor(user, req.body?.code)).ok) {
    await recordFailure(limited.rules)
    return res.status(400).json({ error: "That code isn't right" })
  }
  const { codes, hashes } = makeRecoveryCodes()
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.recoveryCodes': hashes } })
  res.json({ recoveryCodes: codes })
})

module.exports = router
