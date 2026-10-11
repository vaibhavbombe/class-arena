const Hint = require('../../models/Hint')
const CodeSubmission = require('../../models/CodeSubmission')
const { getRedis } = require('../redis')
const { chatJSON } = require('./client')
const hints = require('./hints')

// Hands out a student's next hint on a practice problem: checks the order and the limits,
// asks the AI, falls back to a fixed hint if the AI is off or fails, and saves the result.

const LIMITS = { perStudentPerDay: 30, perInstitutionPerDay: 500, cooldownMs: 10000 }
const DAY_SECONDS = 24 * 60 * 60

const hintView = (h) => ({ level: h.level, text: h.text, focus: h.focus, source: h.source, createdAt: h.createdAt })

async function hintsFor(problemId, studentId) {
  return Hint.find({ problemId, studentId }).sort({ level: 1 })
}

// Counts one AI call against the student's and the institute's daily budgets.
// Answers 'student' or 'institution' when a budget is used up, otherwise null.
async function spendBudget(redis, { studentId, institutionId }) {
  if (!redis) return null
  const day = new Date().toISOString().slice(0, 10)
  const keys = [`ai:day:${day}:user:${studentId}`, `ai:day:${day}:inst:${institutionId}`]
  const [[, studentCount], , [, institutionCount]] = await redis.multi().incr(keys[0]).expire(keys[0], DAY_SECONDS).incr(keys[1]).expire(keys[1], DAY_SECONDS).exec()
  if (studentCount > LIMITS.perStudentPerDay) return 'student'
  if (institutionCount > LIMITS.perInstitutionPerDay) return 'institution'
  return null
}

function latestSummary(submission, sampleCount) {
  if (!submission || submission.status !== 'done') return null
  return {
    verdict: submission.verdict,
    // Samples only: hidden-test details are never stored, and never sent to the AI.
    failedSamples: (submission.tests || []).filter((t) => t.kind === 'sample' && !t.passed && t.index < sampleCount).slice(0, 2),
  }
}

/**
 * @returns { hint } or { error, status }
 */
async function nextHint({ problem, student, code }) {
  const existing = await hintsFor(problem._id, student.userId)
  const level = existing.length + 1
  if (level > hints.MAX_LEVEL) return { status: 409, error: 'You have used all 3 hints for this problem' }

  const redis = getRedis()
  if (redis && !(await redis.set(`rate:hint:${student.userId}`, '1', 'PX', LIMITS.cooldownMs, 'NX'))) {
    return { status: 429, error: 'Please wait a few seconds before asking for another hint' }
  }

  const latest = await CodeSubmission.findOne({ problemId: problem._id, studentId: student.userId }).sort({ createdAt: -1 })
  const context = {
    problem: { title: problem.title, prompt: problem.prompt, functionName: problem.code.functionName, sampleTests: problem.code.sampleTests },
    level,
    code: typeof code === 'string' ? code : latest?.code || '',
    latest: latestSummary(latest, problem.code.sampleTests.length),
    previous: existing.map((h) => h.text),
  }

  let result = { ok: false, reason: 'budget' }
  const overBudget = await spendBudget(redis, { studentId: student.userId, institutionId: student.institutionId })
  if (overBudget === 'student') return { status: 429, error: `You've reached today's limit of ${LIMITS.perStudentPerDay} AI hints. Try again tomorrow.` }
  if (!overBudget) {
    result = await chatJSON({
      messages: hints.buildHintMessages(context),
      validate: (data) => hints.validateHint(data, problem.code.functionName),
      maxTokens: 300,
    })
  }

  const fields = result.ok
    ? { text: result.data.hint.trim(), focus: result.data.focus, source: 'ai', model: result.model }
    : { text: hints.fallbackHint(context), focus: null, source: 'fallback', model: null }
  try {
    const saved = await Hint.create({ institutionId: student.institutionId, problemId: problem._id, studentId: student.userId, level, ...fields })
    return { hint: hintView(saved) }
  } catch (err) {
    // Two requests raced for the same level: return the one that was saved first.
    if (err.code === 11000) return { hint: hintView(await Hint.findOne({ problemId: problem._id, studentId: student.userId, level })) }
    throw err
  }
}

module.exports = { LIMITS, nextHint, hintsFor, hintView }
