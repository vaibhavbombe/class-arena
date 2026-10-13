const mongoose = require('mongoose')

const ROLES = ['admin', 'teacher', 'student']

const userSchema = new mongoose.Schema({
  // Emails are globally unique: one account belongs to exactly one institute.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  role: { type: String, enum: ROLES, required: true },
  // Teachers only: a custom role (models/Role.js) replaces the built-in teacher permissions.
  customRoleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  // Two-factor login (lib/mfa.js). Secrets are encrypted (lib/secretBox.js); recovery codes are
  // SHA-256 hashes, each usable once; lastStep is the last TOTP time step used (no replays).
  mfa: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, default: null },
    pendingSecret: { type: String, default: null },
    lastStep: { type: Number, default: -1 },
    recoveryCodes: { type: [String], default: [] },
    enabledAt: { type: Date, default: null },
  },
  createdAt: { type: Date, default: Date.now },
})

// Admin "list members of my institute, filtered by role".
userSchema.index({ institutionId: 1, role: 1 })

module.exports = mongoose.models.User || mongoose.model('User', userSchema)
module.exports.ROLES = ROLES
