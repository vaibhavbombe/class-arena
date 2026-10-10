const mongoose = require('mongoose')

// One played (or playing) game. `items` is the quiz copied when the game was created,
// including the answer key, which never leaves the server before each reveal.
// Live state (players, scores, answers) is in Redis while the game runs; the final
// standings and per-question stats are saved here when it ends.
const optionSchema = new mongoose.Schema({ id: String, text: String, correct: Boolean }, { _id: false })

const liveGameSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveQuiz', required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  pin: { type: String, required: true },
  status: { type: String, enum: ['live', 'ended'], default: 'live' },
  items: {
    type: [new mongoose.Schema({
      seconds: Number,
      type: String,
      prompt: String,
      options: [optionSchema],
      explanation: String,
    }, { _id: false })],
    required: true,
  },
  endedAt: { type: Date, default: null },
  results: {
    type: new mongoose.Schema({
      players: [new mongoose.Schema({ studentId: mongoose.Schema.Types.ObjectId, name: String, score: Number, correctCount: Number, rank: Number }, { _id: false })],
      questions: [new mongoose.Schema({ index: Number, prompt: String, answeredCount: Number, correctCount: Number, distribution: { type: Map, of: Number } }, { _id: false })],
    }, { _id: false }),
    default: null,
  },
}, { timestamps: true })

liveGameSchema.index({ institutionId: 1, classId: 1, status: 1 })
liveGameSchema.index({ quizId: 1, createdAt: -1 })

module.exports = mongoose.models.LiveGame || mongoose.model('LiveGame', liveGameSchema)
