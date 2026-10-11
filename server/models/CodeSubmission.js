const mongoose = require('mongoose')

// One "Submit" of code for a practice problem. Created as 'queued'; the judge result is
// filled in when the worker publishes it (see judge/queue.js). Only pass/fail per test is
// stored, not hidden-test inputs or outputs.
const codeSubmissionSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true },
  status: { type: String, enum: ['queued', 'done'], default: 'queued' },
  verdict: { type: String, default: null },
  passed: { type: Number, default: null },
  total: { type: Number, default: null },
  timeMs: { type: Number, default: null },
  error: { type: String, default: null }, // compile errors only (they don't depend on hidden data)
  // The student-safe per-test summary (samples in full, hidden as pass/fail + verdict).
  tests: { type: [mongoose.Schema.Types.Mixed], default: [] },
  judgedAt: { type: Date, default: null },
}, { timestamps: true })

codeSubmissionSchema.index({ problemId: 1, studentId: 1, createdAt: -1 })
codeSubmissionSchema.index({ institutionId: 1, studentId: 1 })

module.exports = mongoose.models.CodeSubmission || mongoose.model('CodeSubmission', codeSubmissionSchema)
