const crypto = require('crypto')
const User = require('../models/User')
const totp = require('./totp')
const secretBox = require('./secretBox')

// Second factor checks shared by the 2FA settings (routes/mfa.js) and, later, login.
// A code is consumed with one atomic update, so the same code can't be used twice, not even by
// two requests at the same moment.

const RECOVERY_COUNT = 10
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/o, 1/l/i to misread

const hashCode = (code) => crypto.createHash('sha256').update(String(code).trim().toLowerCase().replace(/\s/g, '')).digest('hex')

// 10 codes like "k7m2x-9qpab" (about 50 bits each); only their hashes are stored. randomInt picks each
// character uniformly (byte % 31 would make the first few letters slightly more likely).
function makeRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)])
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`
  })
  return { codes, hashes: codes.map(hashCode) }
}

/**
 * Checks and consumes a second factor for a user with 2FA on: either the current 6-digit code
 * or one of their recovery codes. Returns { ok: true, kind } or { ok: false }.
 */
async function consumeSecondFactor(user, input) {
  const code = typeof input === 'string' ? input.trim() : ''
  if (!user.mfa?.enabled || !code) return { ok: false }

  if (/^\d{6}$/.test(code)) {
    const counter = totp.verify(secretBox.decrypt(user.mfa.secret), code, { afterCounter: user.mfa.lastStep })
    if (counter === null) return { ok: false }
    // Only succeeds if no newer (or equal) step was used meanwhile: a code works once.
    const used = await User.updateOne({ _id: user._id, 'mfa.lastStep': { $lt: counter } }, { $set: { 'mfa.lastStep': counter } })
    return used.modifiedCount === 1 ? { ok: true, kind: 'totp' } : { ok: false }
  }

  // A recovery code: removed in the same update that checks it.
  const removed = await User.updateOne({ _id: user._id, 'mfa.recoveryCodes': hashCode(code) }, { $pull: { 'mfa.recoveryCodes': hashCode(code) } })
  return removed.modifiedCount === 1 ? { ok: true, kind: 'recovery' } : { ok: false }
}

module.exports = { RECOVERY_COUNT, hashCode, makeRecoveryCodes, consumeSecondFactor }
