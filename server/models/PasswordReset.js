const mongoose = require('mongoose')

// Only a SHA-256 hash of the reset token is stored. If the database leaks,
// the stored values can't be turned back into working reset links.
const passwordResetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

passwordResetSchema.index({ userId: 1 })
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema)
