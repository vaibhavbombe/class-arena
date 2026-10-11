// Live coding contests: server-decided timing, ICPC penalties, the freeze, live socket pings,
// tenant isolation, and hidden tests never reaching students.
const { io } = require('socket.io-client')
const mongoose = require('mongoose')
const Contest = require('../models/Contest')
const ContestSubmission = require('../models/ContestSubmission')
const { BASE, run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const MIN = 60 * 1000
const oid = (value) => new mongoose.Types.ObjectId(String(value))
// Hidden values chosen to be easy to spot if they leak.
const LEAKS = /\b(4141|8282|7373|9191)\b|hiddenTests|referenceSolution/

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}

function nextPing(socket, ms = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    socket.once('contest:updated', (payload) => { clearTimeout(timer); resolve(payload) })
  })
}

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Contests', name: 'Admin', email: `cn-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'cn-t-')
  const cls = (await call('POST', '/api/classes', { name: 'Algo' }, T.accessToken)).d
  const student = async (name) => (await call('POST', '/api/auth/student-signup', { name, email: `cn-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const [ann, bob, cat] = [await student('Ann'), await student('Bob'), await student('Cat')]
  const other = (await call('POST', '/api/auth/signup', { institutionName: 'Elsewhere', name: 'Other', email: `cn-o${run}@example.com`, password: PW })).d

  const question = async (prompt, functionName, hidden) => (await call('POST', '/api/questions', {
    type: 'code', prompt, code: { functionName, starterCode: `function ${functionName}(n) {\n}\n`, sampleTests: [{ input: [2], expected: functionName === 'double' ? 4 : 3 }], hiddenTests: hidden, timeLimitMs: 300 },
  }, T.accessToken)).d
  const qA = await question('Double it', 'double', [{ input: [4141], expected: 8282 }])
  const qB = await question('Add one', 'inc', [{ input: [7373], expected: 7374 }, { input: [9191], expected: 9192 }])

  const created = await call('POST', '/api/contests', { classId: cls.id, title: 'Friday Cup' }, T.accessToken)
  check('teacher creates a contest (draft)', created.s === 201 && created.d.status === 'draft', created.d)
  const id = created.d.id
  const studentsCreate = await call('POST', '/api/contests', { classId: cls.id, title: 'x' }, ann.accessToken)
  check('students cannot create contests', studentsCreate.s === 403, studentsCreate.d)
  check('students do not see drafts', (await call('GET', `/api/contests/${id}`, null, ann.accessToken)).s === 404, null)

  const badFreeze = await call('PUT', `/api/contests/${id}`, { durationMinutes: 30, freezeMinutes: 30 }, T.accessToken)
  check('the freeze must be shorter than the contest', badFreeze.s === 400, badFreeze.d)
  const future = new Date(Date.now() + 60 * MIN).toISOString()
  const setup = await call('PUT', `/api/contests/${id}`, { durationMinutes: 60, freezeMinutes: 15, penaltyMinutes: 20, startsAt: future, problemIds: [qA._id, qB._id] }, T.accessToken)
  check('settings and problems saved; problems labelled A, B', setup.s === 200 && setup.d.problems.map((p) => p.label).join() === 'A,B' && setup.d.problems[0].hiddenTests.length === 1, setup.d)
  const published = await call('POST', `/api/contests/${id}/publish`, null, T.accessToken)
  check('published for a future start: status upcoming', published.s === 200 && published.d.status === 'upcoming', published.d)

  const early = await call('GET', `/api/contests/${id}`, null, ann.accessToken)
  check('before the start students see the contest but no problems', early.s === 200 && early.d.status === 'upcoming' && early.d.problems.length === 0 && !/Double it/.test(JSON.stringify(early.d)), early.d)
  const earlySubmit = await call('POST', `/api/contests/${id}/problems/0/submit`, { code: 'x' }, ann.accessToken)
  check('submitting before the start is refused', earlySubmit.s === 409, earlySubmit.d)
  check('another institute cannot see the contest', (await call('GET', `/api/contests/${id}`, null, other.accessToken)).s === 404, null)

  const started = await call('POST', `/api/contests/${id}/start`, null, T.accessToken)
  check('Start now: the contest is running', started.s === 200 && started.d.status === 'running', started.d)
  const locked = await call('PUT', `/api/contests/${id}`, { durationMinutes: 90 }, T.accessToken)
  check('settings are locked once it has started', locked.s === 409, locked.d)

  const view = (await call('GET', `/api/contests/${id}`, null, ann.accessToken)).d
  check('students now get problems with samples and hidden-test counts', view.problems.length === 2 && view.problems[1].hiddenTestCount === 2 && view.problems[0].sampleTests.length === 1, view.problems)
  check('the student view never contains hidden tests or reference solutions', !LEAKS.test(JSON.stringify(view)), null)

  // Live pings: an enrolled student can watch; another institute cannot.
  const annSocket = await connect(ann.accessToken)
  const watch = await annSocket.emitWithAck('contest:watch', { contestId: id })
  const otherSocket = await connect(other.accessToken)
  const denied = await otherSocket.emitWithAck('contest:watch', { contestId: id })
  check('students can watch the board; other institutes cannot', watch.ok === true && denied.error === 'Contest not found', { watch, denied })

  const submit = (S, index, code) => call('POST', `/api/contests/${id}/problems/${index}/submit`, { code }, S.accessToken)
  async function judged(S, submissionId) {
    for (let i = 0; i < 60; i++) {
      const got = (await call('GET', `/api/contests/${id}/submissions/${submissionId}`, null, S.accessToken)).d
      if (got.status === 'done') return got
      await sleep(250)
    }
    return null
  }

  const ping = nextPing(annSocket)
  const annWrong = await submit(ann, 0, 'function double(n) { return n + n + 1 }')
  check('a submission is queued (202)', annWrong.s === 202 && annWrong.d.status === 'queued', annWrong.d)
  check('the board gets a live "updated" ping', (await ping)?.contestId === id, null)
  const annWrongResult = await judged(ann, annWrong.d.id)
  check('wrong code: Wrong Answer, hidden test shown only as pass/fail', annWrongResult?.verdict === 'Wrong Answer' && !LEAKS.test(JSON.stringify(annWrongResult)), annWrongResult)
  check('one submission per 5 seconds', (await submit(ann, 0, 'function double(n) { return 2 * n }')).s === 429, null)

  const bobRight = await submit(bob, 0, 'function double(n) { return 2 * n }')
  const catCompile = await submit(cat, 1, 'function inc(n) { return n + }')
  check('right code: Accepted', (await judged(bob, bobRight.d.id))?.verdict === 'Accepted', null)
  check('broken code: Compile Error', (await judged(cat, catCompile.d.id))?.verdict === 'Compile Error', null)
  await sleep(5100)
  const annRight = await submit(ann, 0, 'function double(n) { return 2 * n }')
  check('Ann solves A on her second try', (await judged(ann, annRight.d.id))?.verdict === 'Accepted', null)

  // Move the clock: say the contest started minutesAgo minutes ago, and date each submission by its
  // minute into the contest. (60 minutes long, freeze 15: it freezes at minute 45.)
  const timeline = [[annWrong.d.id, 10], [annRight.d.id, 12], [bobRight.d.id, 15], [catCompile.d.id, 20]]
  async function moveClock(minutesAgo) {
    const start = new Date(Date.now() - minutesAgo * MIN)
    await Contest.collection.updateOne({ _id: oid(id) }, { $set: { startsAt: start } })
    for (const [subId, minute] of timeline) {
      await ContestSubmission.collection.updateOne({ _id: oid(subId) }, { $set: { createdAt: new Date(start.getTime() + minute * MIN + 1000) } })
    }
  }
  await moveClock(50)

  const board = (await call('GET', `/api/contests/${id}/standings`, null, ann.accessToken)).d
  const by = (b) => Object.fromEntries(b.rows.map((r) => [r.name, r]))
  const live = by(board)
  check('ICPC ranking: Bob (1 solved, 15 min) above Ann (1 solved, 12 + 20 = 32 min)', live.Bob.rank === 1 && live.Bob.penalty === 15 && live.Ann.rank === 2 && live.Ann.penalty === 32, board.rows)
  check('compile errors are not penalised; the first solver (Ann, minute 12) gets the star', live.Cat.penalty === 0 && live.Cat.problems[1].wrongTries === 0 && live.Ann.problems[0].firstSolve === true && live.Bob.problems[0].firstSolve === false, live)
  check('your own row is marked', live.Ann.me === true && live.Bob.me === false, null)
  check('the board shows the freeze to students', board.status === 'frozen' && board.frozen === true, board)

  // During the freeze: Cat solves B. Students don't see it; staff do.
  const catRight = await submit(cat, 1, 'function inc(n) { return n + 1 }')
  await judged(cat, catRight.d.id)
  timeline.push([catRight.d.id, 50])
  const frozen = by((await call('GET', `/api/contests/${id}/standings`, null, bob.accessToken)).d)
  const staffBoard = (await call('GET', `/api/contests/${id}/standings`, null, T.accessToken)).d
  const staff = by(staffBoard)
  check('frozen board: students see a "?" try, not the solve', frozen.Cat.solved === 0 && frozen.Cat.problems[1].frozenTries === 1, frozen.Cat)
  check('teachers always see the live board', staffBoard.frozen === false && staff.Cat.solved === 1, staff.Cat)
  check('the board never contains hidden tests', !LEAKS.test(JSON.stringify(staffBoard)), null)

  // The contest ends: submissions close and the board unfreezes for everyone.
  await moveClock(61)
  await sleep(5100)
  const late = await submit(ann, 1, 'function inc(n) { return n + 1 }')
  check('submitting after the end is refused', late.s === 409, late.d)
  const final = (await call('GET', `/api/contests/${id}/standings`, null, bob.accessToken)).d
  check('after the end the board unfreezes for students (Cat solved B)', final.status === 'ended' && final.frozen === false && by(final).Cat.solved === 1, final.rows)

  const list = (await call('GET', `/api/contests?classId=${cls.id}`, null, ann.accessToken)).d
  check('students see the contest in the class list', list.length === 1 && list[0].status === 'ended', list)

  const removed = await call('DELETE', `/api/contests/${id}`, null, T.accessToken)
  check('deleting a contest removes its submissions', removed.s === 200 && (await ContestSubmission.countDocuments({ contestId: id })) === 0, removed.d)

  annSocket.close()
  otherSocket.close()
  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
