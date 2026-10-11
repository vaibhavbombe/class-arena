const CodeSubmission = require('../../models/CodeSubmission')
const { spendBudget } = require('./budget')
const { chatJSON } = require('./client')
const feedback = require('./feedback')

// Writes the one review a judged practice submission can get. The submission is claimed with
// an atomic update first, so double clicks or two tabs can't start two AI calls; a claim that
// never finished (e.g. the server restarted) can be taken again after CLAIM_MS.

const LIMITS = { perStudentPerDay: 20 }
const CLAIM_MS = 90 * 1000

/**
 * @returns { feedback } or { status, error }
 */
async function requestFeedback({ problem, submission, student }) {
  if (submission.status !== 'done') return { status: 409, error: 'Wait until the submission has been judged' }
  if (submission.feedback) return { feedback: submission.feedback }

  const now = new Date()
  const claimed = await CodeSubmission.findOneAndUpdate(
    { _id: submission._id, feedback: null, $or: [{ feedbackClaimedAt: null }, { feedbackClaimedAt: { $lt: new Date(now - CLAIM_MS) } }] },
    { $set: { feedbackClaimedAt: now } },
    { returnDocument: 'after' },
  )
  if (!claimed) {
    const current = await CodeSubmission.findById(submission._id).select('feedback')
    return current?.feedback ? { feedback: current.feedback } : { status: 409, error: 'Feedback is already being written. Check again in a moment.' }
  }

  const over = await spendBudget({ feature: 'feedback', userId: student.userId, institutionId: student.institutionId, userLimit: LIMITS.perStudentPerDay })
  if (over === 'user') {
    await CodeSubmission.updateOne({ _id: submission._id, feedback: null }, { $set: { feedbackClaimedAt: null } })
    return { status: 429, error: `You've reached today's limit of ${LIMITS.perStudentPerDay} AI reviews. Try again tomorrow.` }
  }

  const result = over
    ? { ok: false }
    : await chatJSON({
      messages: feedback.buildFeedbackMessages({ problem: { title: problem.title, prompt: problem.prompt, functionName: problem.code.functionName, sampleTests: problem.code.sampleTests }, submission }),
      validate: (data) => feedback.validateFeedback(data, problem.code.functionName),
      maxTokens: 500,
    })
  const review = {
    ...(result.ok ? result.data : feedback.fallbackFeedback(submission)),
    source: result.ok ? 'ai' : 'fallback',
    model: result.ok ? result.model : null,
    createdAt: new Date(),
  }
  const saved = await CodeSubmission.findOneAndUpdate({ _id: submission._id, feedback: null }, { $set: { feedback: review } }, { returnDocument: 'after' })
  return { feedback: saved ? saved.feedback : (await CodeSubmission.findById(submission._id).select('feedback')).feedback }
}

module.exports = { LIMITS, CLAIM_MS, requestFeedback }
