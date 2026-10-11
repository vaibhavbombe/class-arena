const mongoose = require('mongoose')

// One "Submit" during a contest. Like a practice CodeSubmission, it's created 'queued' and
// filled in when the judge publishes the result; only a student-safe summary is stored.
// createdAt (set by the server) is the submission time used for penalties and the freeze.
const contestSubmissionSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemIndex: { type: Number, required: true },
  code: { type: String, required: true },
  status: { type: String, enum: ['queued', 'done'], default: 'queued' },
  verdict: { type: String, default: null },
  passed: { type: Number, default: null },
  total: { type: Number, default: null },
  timeMs: { type: Number, default: null },
  error: { type: String, default: null },
  tests: { type: [mongoose.Schema.Types.Mixed], default: [] },
  judgedAt: { type: Date, default: null },
}, { timestamps: true })

contestSubmissionSchema.index({ contestId: 1, createdAt: 1 })
contestSubmissionSchema.index({ contestId: 1, studentId: 1, createdAt: -1 })
contestSubmissionSchema.index({ institutionId: 1, studentId: 1 })

module.exports = mongoose.models.ContestSubmission || mongoose.model('ContestSubmission', contestSubmissionSchema)
