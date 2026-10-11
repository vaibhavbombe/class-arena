const mongoose = require('mongoose')

// A hint a student received on a practice problem. Levels go 1, 2, 3 in order; the unique
// index means a level is generated (and paid for) once, even if the button is double-clicked.
const hintSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  level: { type: Number, required: true, min: 1, max: 3 },
  text: { type: String, required: true },
  focus: { type: String, default: null },
  source: { type: String, enum: ['ai', 'fallback'], required: true },
  model: { type: String, default: null },
}, { timestamps: true })

hintSchema.index({ problemId: 1, studentId: 1, level: 1 }, { unique: true })
hintSchema.index({ institutionId: 1, studentId: 1 })

module.exports = mongoose.models.Hint || mongoose.model('Hint', hintSchema)
