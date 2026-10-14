const mongoose = require('mongoose')

// The tenant. Every tenant-scoped document stores an institutionId.
const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // Security policy (admins): staff (admins, teachers) must have two-factor login on to use the app.
  requireStaffMfa: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.models.Institution || mongoose.model('Institution', institutionSchema)
