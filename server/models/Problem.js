const mongoose = require('mongoose')
const { codeSchema } = require('./Question')

// A coding question assigned to a class for practice. It keeps its own copy of the
// question (including hidden tests), so editing the bank later doesn't change a problem
// students are already working on. Hidden tests and the reference solution never leave
// the server; students get the view built in lib/problemViews.js.
const problemSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  prompt: { type: String, required: true },
  difficulty: { type: String, default: 'medium' },
  code: { type: codeSchema, required: true },
}, { timestamps: true })

problemSchema.index({ institutionId: 1, classId: 1, createdAt: -1 })

module.exports = mongoose.models.Problem || mongoose.model('Problem', problemSchema)
