const mongoose = require('mongoose')
const Contest = require('../models/Contest')
const ContestSubmission = require('../models/ContestSubmission')
const { findVisibleClass } = require('./classAccess')
const { studentProblemView, staffProblemView, studentResult } = require('./problemViews')
const rules = require('./contestRules')
const { getResult } = require('../judge/queue')
const { STALE_MS } = require('./submissions')

// Contest access, views and judge results. Shared by routes/contests.js and the socket
// room in realtime/contests.js, so HTTP and Socket.io apply exactly the same rules.

const JOB_PREFIX = 'contest:'
const isStaff = (who) => who.role === 'teacher' || who.role === 'admin'

// `who` is req or a socket identity: { userId, institutionId, role }. Students never see
// drafts. Answers null for anything not visible (callers send 404).
async function findVisibleContest(who, contestId) {
  if (!mongoose.isValidObjectId(contestId)) return null
  const contest = await Contest.findOne({ _id: contestId, institutionId: who.institutionId })
  if (!contest) return null
  if (!(await findVisibleClass(who, contest.classId))) return null
  if (!isStaff(who) && !contest.published) return null
  return contest
}

function timing(contest, now) {
  return {
    status: rules.contestStatus(contest, now),
    startsAt: contest.startsAt,
    endsAt: rules.endsAt(contest),
    freezesAt: rules.freezesAt(contest),
    // Lets the browser correct for its own clock when showing countdowns.
    serverNow: now,
  }
}

function summary(contest, now = new Date()) {
  return {
    id: contest._id,
    classId: contest.classId,
    title: contest.title,
    published: contest.published,
    durationMinutes: contest.durationMinutes,
    penaltyMinutes: contest.penaltyMinutes,
    freezeMinutes: contest.freezeMinutes,
    problemCount: contest.problems.length,
    ...timing(contest, now),
  }
}

// Contest problems are subdocuments; the shared problem views expect a plain problem.
const asProblem = (p, classId) => ({ ...(p.toObject ? p.toObject() : p), classId })

// Students get no problems before the start, and never hidden tests or the reference solution.
function studentContestView(contest, now = new Date()) {
  const view = summary(contest, now)
  if (view.status === 'upcoming' || view.status === 'draft') return { ...view, problems: [] }
  return {
    ...view,
    problems: contest.problems.map((p, i) => {
      const { id, classId, ...rest } = studentProblemView(asProblem(p, contest.classId))
      return { index: i, label: rules.label(i), ...rest }
    }),
  }
}

function staffContestView(contest, now = new Date()) {
  return {
    ...summary(contest, now),
    problems: contest.problems.map((p, i) => {
      const { id, classId, ...rest } = staffProblemView(asProblem(p, contest.classId))
      return { index: i, label: rules.label(i), ...rest }
    }),
  }
}

const submissionSummary = (s) => ({
  id: s._id, problemIndex: s.problemIndex, status: s.status, verdict: s.verdict, passed: s.passed, total: s.total, timeMs: s.timeMs, createdAt: s.createdAt,
})

let notify = () => {}
// realtime/contests.js registers how to tell a contest room that something changed.
function onContestChange(fn) {
  notify = fn
}
const contestChanged = (contestId) => notify(String(contestId))

// Judge result for a contest submission (job id "contest:<submissionId>"). Only moves
// 'queued' -> 'done', so a duplicate message can't change anything.
async function finalizeContestSubmission(jobId, result) {
  if (typeof jobId !== 'string' || !jobId.startsWith(JOB_PREFIX)) return null
  const id = jobId.slice(JOB_PREFIX.length)
  if (!mongoose.isValidObjectId(id)) return null
  const submission = await ContestSubmission.findOne({ _id: id, status: 'queued' })
  if (!submission) return null
  const contest = await Contest.findById(submission.contestId).select('problems.code.sampleTests')
  const sampleCount = contest?.problems[submission.problemIndex]?.code.sampleTests.length ?? 0
  const safe = result
    ? studentResult(result, sampleCount)
    : { verdict: 'Judge Error', passed: 0, total: 0, timeMs: null, error: 'The judge did not return a result', tests: [] }
  const saved = await ContestSubmission.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'done', ...safe, judgedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (saved) contestChanged(saved.contestId)
  return saved
}

// Picks up results the listener missed and settles jobs the judge lost. Lost jobs become
// Judge Error, which carries no penalty.
async function settleContestSubmissions(contestId) {
  const queued = await ContestSubmission.find({ contestId, status: 'queued' })
  for (const submission of queued) {
    const result = await getResult(JOB_PREFIX + submission.id)
    if (result) await finalizeContestSubmission(JOB_PREFIX + submission.id, result)
    else if (Date.now() - submission.createdAt.getTime() > STALE_MS) await finalizeContestSubmission(JOB_PREFIX + submission.id, null)
  }
}

module.exports = {
  JOB_PREFIX, isStaff, findVisibleContest, summary, studentContestView, staffContestView, submissionSummary,
  onContestChange, contestChanged, finalizeContestSubmission, settleContestSubmissions,
}
