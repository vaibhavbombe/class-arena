// Pure rules for live coding contests (ICPC style). Unit-tested in test/contestRules.test.js.
//
// Ranking: problems solved (more is better), then penalty (less is better), then the time of the
// last solve (earlier is better). Penalty = for every SOLVED problem, minutes from the start to the
// first accepted submission + penaltyMinutes for each earlier wrong try on it. Compile errors and
// judge errors are never penalised. During the freeze, students see only submissions made before it
// (later tries show as "?"); staff always see everything. The board unfreezes when the contest ends.

const LIMITS = { title: 200, minMinutes: 10, maxMinutes: 600, maxPenalty: 60, minProblems: 1, maxProblems: 12 }
const NOT_PENALISED = new Set(['Compile Error', 'Judge Error'])
const MINUTE = 60 * 1000

const label = (index) => String.fromCharCode(65 + index) // 0 -> A

function parseSettings(body, current = {}) {
  const changes = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'title is required' }
    if (body.title.length > LIMITS.title) return { error: `title can be at most ${LIMITS.title} characters` }
    changes.title = body.title.trim()
  }
  if ('startsAt' in body) {
    if (body.startsAt === null) changes.startsAt = null
    else if (typeof body.startsAt !== 'string' || Number.isNaN(Date.parse(body.startsAt))) return { error: 'startsAt must be a date' }
    else changes.startsAt = new Date(body.startsAt)
  }
  for (const [field, min, max] of [['durationMinutes', LIMITS.minMinutes, LIMITS.maxMinutes], ['penaltyMinutes', 0, LIMITS.maxPenalty], ['freezeMinutes', 0, LIMITS.maxMinutes]]) {
    if (field in body) {
      if (!Number.isInteger(body[field]) || body[field] < min || body[field] > max) return { error: `${field} must be a whole number from ${min} to ${max}` }
      changes[field] = body[field]
    }
  }
  const duration = changes.durationMinutes ?? current.durationMinutes
  const freeze = changes.freezeMinutes ?? current.freezeMinutes ?? 0
  if (duration && freeze >= duration) return { error: 'The freeze must be shorter than the contest' }
  return { changes }
}

function parseProblemIds(list) {
  if (!Array.isArray(list) || list.length < LIMITS.minProblems || list.length > LIMITS.maxProblems) {
    return { error: `A contest needs ${LIMITS.minProblems} to ${LIMITS.maxProblems} problems` }
  }
  if (!list.every((id) => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id))) return { error: 'Every problem needs a valid questionId' }
  if (new Set(list).size !== list.length) return { error: 'The same question is in the contest twice' }
  return { ids: list }
}

function endsAt(contest) {
  return contest.startsAt ? new Date(contest.startsAt.getTime() + contest.durationMinutes * MINUTE) : null
}

function freezesAt(contest) {
  const end = endsAt(contest)
  return end && contest.freezeMinutes ? new Date(end.getTime() - contest.freezeMinutes * MINUTE) : null
}

// draft (not published) | upcoming | running | frozen | ended, by the server's clock.
function contestStatus(contest, now = new Date()) {
  if (!contest.published || !contest.startsAt) return 'draft'
  if (now < contest.startsAt) return 'upcoming'
  if (now >= endsAt(contest)) return 'ended'
  const freezeAt = freezesAt(contest)
  return freezeAt && now >= freezeAt ? 'frozen' : 'running'
}

/**
 * @param contest      { startsAt, durationMinutes, freezeMinutes, penaltyMinutes, problems: [...] }
 * @param submissions  [{ studentId, problemIndex, verdict, status ('queued'|'done'), createdAt }]
 * @param students     [{ id, name }] (enrolled students; anyone who submitted is added too)
 * @param staff        staff always see the live board
 */
function standings({ contest, submissions, students, now = new Date(), staff = false }) {
  const start = contest.startsAt.getTime()
  const end = endsAt(contest).getTime()
  const freezeAt = freezesAt(contest)?.getTime() ?? null
  const frozen = !staff && freezeAt !== null && now.getTime() >= freezeAt && now.getTime() < end
  const problemCount = contest.problems.length

  const names = new Map(students.map((s) => [String(s.id), s.name]))
  for (const s of submissions) if (!names.has(String(s.studentId))) names.set(String(s.studentId), s.studentName || 'Former student')

  // Only submissions inside the contest window count, oldest first.
  const inWindow = submissions
    .filter((s) => new Date(s.createdAt).getTime() >= start && new Date(s.createdAt).getTime() < end)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  const firstSolve = Array(problemCount).fill(null) // earliest visible accepted time per problem
  const rows = [...names.entries()].map(([studentId, name]) => {
    let solved = 0
    let penalty = 0
    let lastSolveMinute = 0
    const problems = Array.from({ length: problemCount }, (_, problemIndex) => {
      const mine = inWindow.filter((s) => String(s.studentId) === studentId && s.problemIndex === problemIndex)
      const visible = frozen ? mine.filter((s) => new Date(s.createdAt).getTime() < freezeAt) : mine
      const frozenTries = frozen ? mine.length - visible.length : 0
      let wrongTries = 0
      let pending = 0
      let solvedAt = null
      for (const s of visible) {
        if (s.status !== 'done') { pending++; continue }
        if (s.verdict === 'Accepted') { solvedAt = new Date(s.createdAt).getTime(); break }
        if (!NOT_PENALISED.has(s.verdict)) wrongTries++
      }
      if (solvedAt === null) return { solved: false, wrongTries, pending, frozenTries }
      const minute = Math.floor((solvedAt - start) / MINUTE)
      solved++
      penalty += minute + wrongTries * contest.penaltyMinutes
      lastSolveMinute = Math.max(lastSolveMinute, minute)
      if (firstSolve[problemIndex] === null || solvedAt < firstSolve[problemIndex].at) firstSolve[problemIndex] = { at: solvedAt, studentId }
      return { solved: true, minute, wrongTries, pending, frozenTries, solvedAt }
    })
    return { studentId, name, solved, penalty, lastSolveMinute, problems }
  })

  rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.lastSolveMinute - b.lastSolveMinute || a.name.localeCompare(b.name))
  let rank = 0
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    if (!prev || prev.solved !== row.solved || prev.penalty !== row.penalty) rank = i + 1
    row.rank = rank
    row.problems.forEach((cell, p) => {
      cell.firstSolve = Boolean(cell.solved && firstSolve[p] && firstSolve[p].studentId === row.studentId)
      delete cell.solvedAt
    })
  })
  return { frozen, rows }
}

module.exports = { LIMITS, label, parseSettings, parseProblemIds, endsAt, freezesAt, contestStatus, standings, MINUTE }
