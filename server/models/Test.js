const mongoose = require('mongoose')

// Each item is a copy of a bank question taken when it was added (and refreshed at
// publish). After publishing, the copy never changes, so editing or deleting the bank
// question can't change a test that students are taking or have taken.
const itemSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  points: { type: Number, required: true },
  type: { type: String, required: true },
  prompt: { type: String, required: true },
  options: {
    type: [new mongoose.Schema({ id: String, text: String, correct: Boolean }, { _id: false })],
    default: undefined,
  },
  acceptedAnswers: { type: [String], default: undefined },
  caseSensitive: { type: Boolean, default: false },
  explanation: { type: String, default: '' },
}, { _id: false })

const testSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  instructions: { type: String, default: '' },
  durationMinutes: { type: Number, required: true },
  opensAt: { type: Date, default: null }, // null: open as soon as it's published
  closesAt: { type: Date, default: null }, // null: no closing time
  shuffleQuestions: { type: Boolean, default: false },
  shuffleOptions: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: { type: Date, default: null },
  // Set when a teacher releases results before the test closes (see lib/results.js).
  resultsReleasedAt: { type: Date, default: null },
  items: { type: [itemSchema], default: [] },
}, { timestamps: true })

testSchema.index({ institutionId: 1, classId: 1, createdAt: -1 })

module.exports = mongoose.models.Test || mongoose.model('Test', testSchema)
