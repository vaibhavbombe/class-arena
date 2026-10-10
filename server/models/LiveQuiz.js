const mongoose = require('mongoose')

// A reusable set of questions for live games. Each game copies the quiz when it starts,
// so a quiz can be edited at any time without affecting games already played.
const itemSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  seconds: { type: Number, required: true },
  type: { type: String, enum: ['mcq', 'multi'], required: true },
  prompt: { type: String, required: true },
  options: {
    type: [new mongoose.Schema({ id: String, text: String, correct: Boolean }, { _id: false })],
    required: true,
  },
  explanation: { type: String, default: '' },
}, { _id: false })

const liveQuizSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  items: { type: [itemSchema], default: [] },
}, { timestamps: true })

liveQuizSchema.index({ institutionId: 1, classId: 1, updatedAt: -1 })

module.exports = mongoose.models.LiveQuiz || mongoose.model('LiveQuiz', liveQuizSchema)
