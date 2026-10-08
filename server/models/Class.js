const mongoose = require('mongoose')

const classSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  subject: { type: String, trim: true, default: '' },
  // Globally unique: a new student signs up with only a code, before we know their institute.
  joinCode: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
})

classSchema.index({ institutionId: 1, teacherId: 1 })

module.exports = mongoose.models.Class || mongoose.model('Class', classSchema)
