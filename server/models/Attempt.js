const mongoose = require('mongoose')

const answerSchema = new mongoose.Schema({
  selectedOptionIds: { type: [String], default: [] },
  text: { type: String, default: '' },
}, { _id: false })

const resultSchema = new mongoose.Schema({
  index: Number,
  correct: Boolean,
  earned: Number,
  max: Number,
}, { _id: false })

const attemptSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, required: true },
  deadline: { type: Date, required: true }, // decided by the server at start
  status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress' },
  submittedAt: { type: Date, default: null },
  submittedBy: { type: String, enum: ['student', 'timeout', null], default: null },
  // This student's question order and option order (indexes/ids into the test's items).
  questionOrder: { type: [Number], required: true },
  optionOrders: { type: [[String]], required: true },
  // Aligned with test.items by index (not by display order).
  answers: { type: [answerSchema], required: true },
  // Bumped on every save, so a submit can tell whether answers changed while it was grading.
  revision: { type: Number, default: 0 },
  score: { type: Number, default: null },
  maxScore: { type: Number, default: null },
  results: { type: [resultSchema], default: undefined },
}, { timestamps: true })

// One attempt per student per test, enforced by the database (two quick "Start" clicks
// can't create two attempts).
attemptSchema.index({ testId: 1, studentId: 1 }, { unique: true })
attemptSchema.index({ institutionId: 1, studentId: 1 })

module.exports = mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema)
