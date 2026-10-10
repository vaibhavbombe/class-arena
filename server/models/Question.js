const mongoose = require('mongoose')

const TYPES = ['mcq', 'multi', 'short', 'code']
const DIFFICULTIES = ['easy', 'medium', 'hard']

// `correct` lives on each option. Only staff routes ever return a Question as-is;
// anything shown to a student goes through a view that strips answers.
const optionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  correct: { type: Boolean, default: false },
}, { _id: false })

// A coding question. Test inputs/expected values are arbitrary JSON (Mixed). Hidden tests and
// the reference solution are staff-only: students only ever get the samples (step 4.3).
const testCaseSchema = new mongoose.Schema({
  input: { type: [mongoose.Schema.Types.Mixed], required: true }, // argument list
  expected: { type: mongoose.Schema.Types.Mixed }, // may legitimately be null, 0 or false (checked in lib/questionInput.js)
}, { _id: false })

const codeSchema = new mongoose.Schema({
  language: { type: String, enum: ['javascript'], default: 'javascript' },
  functionName: { type: String, required: true },
  starterCode: { type: String, default: '' },
  referenceSolution: { type: String, default: '' },
  sampleTests: { type: [testCaseSchema], default: [] },
  hiddenTests: { type: [testCaseSchema], default: [] },
  timeLimitMs: { type: Number, default: 1000 },
  memoryMb: { type: Number, default: 32 },
}, { _id: false })

const questionSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: TYPES, required: true },
  prompt: { type: String, required: true },
  options: { type: [optionSchema], default: undefined }, // mcq / multi
  acceptedAnswers: { type: [String], default: undefined }, // short
  caseSensitive: { type: Boolean, default: false }, // short
  code: { type: codeSchema, default: undefined }, // code
  explanation: { type: String, default: '' }, // shown to students after results are released
  tags: { type: [String], default: [] },
  difficulty: { type: String, enum: DIFFICULTIES, default: 'medium' },
}, { timestamps: true })

questionSchema.index({ institutionId: 1, ownerId: 1, updatedAt: -1 })
questionSchema.index({ institutionId: 1, tags: 1 })

module.exports = mongoose.models.Question || mongoose.model('Question', questionSchema)
module.exports.TYPES = TYPES
module.exports.DIFFICULTIES = DIFFICULTIES
