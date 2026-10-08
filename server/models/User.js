const mongoose = require('mongoose')

const ROLES = ['admin', 'teacher', 'student']

const userSchema = new mongoose.Schema({
  // Emails are globally unique: one account belongs to exactly one institute.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  role: { type: String, enum: ROLES, required: true },
  createdAt: { type: Date, default: Date.now },
})

// Admin "list members of my institute, filtered by role".
userSchema.index({ institutionId: 1, role: 1 })

module.exports = mongoose.models.User || mongoose.model('User', userSchema)
module.exports.ROLES = ROLES
