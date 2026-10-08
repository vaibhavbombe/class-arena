const mongoose = require('mongoose')

// A separate collection instead of a students array on Class: the list can grow
// without bound, and "which classes is this student in?" is one indexed query.
const enrollmentSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt: { type: Date, default: Date.now },
})

enrollmentSchema.index({ classId: 1, studentId: 1 }, { unique: true })
enrollmentSchema.index({ studentId: 1 })

module.exports = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema)
