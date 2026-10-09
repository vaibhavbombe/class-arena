const Attempt = require('../models/Attempt')
const { gradeAttempt } = require('./grading')

// Grades and submits an attempt, safely against answer saves happening at the same time:
// each save bumps `revision`, and the submit only lands if the revision it graded is
// still current. Otherwise it reloads and grades again. Returns the final attempt.
async function finalizeAttempt(attempt, test, submittedBy, now = new Date()) {
  let current = attempt
  for (let tries = 0; tries < 5; tries++) {
    if (current.status === 'submitted') return current
    const { score, maxScore, results } = gradeAttempt(test.items, current.answers)
    const updated = await Attempt.findOneAndUpdate(
      { _id: current._id, status: 'in_progress', revision: current.revision },
      { $set: { status: 'submitted', submittedAt: now, submittedBy, score, maxScore, results } },
      { new: true },
    )
    if (updated) return updated
    current = await Attempt.findById(current._id)
    if (!current) return null
  }
  throw new Error('Could not finalize attempt: answers kept changing')
}

module.exports = { finalizeAttempt }
