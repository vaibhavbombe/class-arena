const mongoose = require('mongoose')

// Only staff are invited. Students self-register with a class join code.
const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
})

inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.models.Invite || mongoose.model('Invite', inviteSchema)
