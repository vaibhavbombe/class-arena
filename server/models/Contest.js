const mongoose = require('mongoose')
const { codeSchema } = require('./Question')

// A timed, ICPC-style coding contest for one class. Each problem is a copy of a bank
// question (hidden tests included), so later bank edits don't change a running contest.
// Status (upcoming / running / frozen / ended) is computed from startsAt by the server's
// clock in lib/contestRules.js; it is never stored or taken from the client.
const contestProblemSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  title: { type: String, required: true },
  prompt: { type: String, required: true },
  difficulty: { type: String, default: 'medium' },
  code: { type: codeSchema, required: true },
}, { _id: false })

const contestSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  published: { type: Boolean, default: false },
  startsAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: 60 },
  penaltyMinutes: { type: Number, default: 20 },
  freezeMinutes: { type: Number, default: 0 },
  problems: { type: [contestProblemSchema], default: [] },
}, { timestamps: true })

contestSchema.index({ institutionId: 1, classId: 1, createdAt: -1 })

module.exports = mongoose.models.Contest || mongoose.model('Contest', contestSchema)
