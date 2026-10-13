const mongoose = require('mongoose')

// A custom staff role defined by an institute's admins (e.g. "Teaching Assistant"): a named set
// of permissions from lib/permissions.js. Teachers who are assigned one get exactly these
// permissions instead of the built-in teacher set. Admin-only permissions can't be stored here.
const roleSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  permissions: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

// Names are unique within an institute (case-insensitive).
roleSchema.index({ institutionId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema)
