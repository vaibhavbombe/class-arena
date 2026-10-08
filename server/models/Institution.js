const mongoose = require('mongoose')

// The tenant. Every tenant-scoped document stores an institutionId.
const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.models.Institution || mongoose.model('Institution', institutionSchema)
