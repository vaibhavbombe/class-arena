// Live game engine over Socket.io: joining, server-timed questions, scoring, reveal, end.
const { io } = require('socket.io-client')
const { BASE, run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')
const LiveGame = require('../models/LiveGame')

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve))
// Resolves with the next `event` on `socket` (or null after `ms`).
const next = (socket, event, ms = 15000) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), ms)
  socket.once(event, (data) => { clearTimeout(timer); resolve(data) })
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Live', name: 'Admin', email: `lg-a${run}@example.com`, password: PW })).d
  const B = (await call('POST', '/api/auth/signup', { institutionName: 'Other', name: 'Admin B', email: `lg-b${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'lg-t-')
  const T2 = await invite(A.accessToken, 'lg-t2-')
  const cls = (await call('POST', '/api/classes', { name: 'Physics' }, T.accessToken)).d
  const otherCls = (await call('POST', '/api/classes', { name: 'Other class' }, T2.accessToken)).d
  const signup = async (name, code) => (await call('POST', '/api/auth/student-signup', { name, email: `lg-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: code })).d
  const [ann, bob, cat] = [await signup('Ann', cls.joinCode), await signup('Bob', cls.joinCode), await signup('Cat', cls.joinCode)]
  const outsider = await signup('Out', otherCls.joinCode)

  const q1 = (await call('POST', '/api/questions', { type: 'mcq', prompt: 'Largest planet?', options: [{ text: 'Mars' }, { text: 'Jupiter', correct: true }, { text: 'Venus' }] }, T.accessToken)).d
  const q2 = (await call('POST', '/api/questions', { type: 'multi', prompt: 'Prime numbers?', options: [{ text: '2', correct: true }, { text: '3', correct: true }, { text: '4' }] }, T.accessToken)).d
  const quiz = (await call('POST', '/api/live-quizzes', { classId: cls.id, title: 'Space quiz' }, T.accessToken)).d
  await call('PUT', `/api/live-quizzes/${quiz.id}`, { items: [{ questionId: q1._id, seconds: 5 }, { questionId: q2._id, seconds: 5 }] }, T.accessToken)
  const right1 = q1.options.find((o) => o.correct).id
  const wrong1 = q1.options.find((o) => !o.correct).id
  const right2 = q2.options.filter((o) => o.correct).map((o) => o.id)

  const byStudent = await call('POST', '/api/live-games', { quizId: quiz.id }, ann.accessToken)
  const byOtherTeacher = await call('POST', '/api/live-games', { quizId: quiz.id }, T2.accessToken)
  check('students and other teachers cannot start a game (403/404)', byStudent.s === 403 && byOtherTeacher.s === 404, { byStudent: byStudent.s, byOtherTeacher: byOtherTeacher.s })
  const game = await call('POST', '/api/live-games', { quizId: quiz.id }, T.accessToken)
  check('teacher starts a game and gets a 6-digit PIN', game.s === 201 && /^[1-9]\d{5}$/.test(game.d.pin), game)
  const { id: gameId, pin } = game.d

  const host = await connect(T.accessToken)
  const t2Host = await connect(T2.accessToken)
  const notHost = await emit(t2Host, 'host:join', { gameId })
  check("another teacher can't host this game", notHost.error === 'Game not found', notHost)
  t2Host.close()
  const hostJoin = await emit(host, 'host:join', { gameId })
  check('host joins: lobby with PIN', hostJoin.ok && hostJoin.status === 'lobby' && hostJoin.pin === pin, hostJoin)

  const [sa, sb, sc, so] = await Promise.all([connect(ann.accessToken), connect(bob.accessToken), connect(cat.accessToken), connect(outsider.accessToken)])
  const wrongPin = await emit(sa, 'player:join', { pin: pin === '999999' ? '999998' : '999999' })
  const outsiderJoin = await emit(so, 'player:join', { pin })
  check('wrong PIN and students from another class get the same "not found"', wrongPin.error === 'No game found with that PIN' && outsiderJoin.error === 'No game found with that PIN', { wrongPin, outsiderJoin })
  const teacherAsPlayer = await emit(host, 'player:join', { pin })
  check('teachers cannot join as players', /Only students/.test(teacherAsPlayer.error || ''), teacherAsPlayer)

  const lobbyUpdate = next(host, 'game:players')
  const annJoin = await emit(sa, 'player:join', { pin })
  check('student joins the lobby; host sees the player list update', annJoin.ok && annJoin.status === 'lobby' && (await lobbyUpdate)?.players.includes('Ann'), annJoin)
  await emit(sb, 'player:join', { pin })
  await emit(sc, 'player:join', { pin })

  const playerNext = await emit(sa, 'host:next', { gameId })
  check("players can't control the game", playerNext.error === 'You are not hosting this game', playerNext)

  // Question 1: Ann right fast, Bob wrong, Cat right slower. All answer -> closes early.
  const q1Seen = next(sa, 'game:question')
  const started = await emit(host, 'host:next', { gameId })
  const question = await q1Seen
  check('question goes out without the answer key', started.ok && question?.index === 0 && question.options.length === 3 && !JSON.stringify(question).includes('correct'), question)
  check('server sets the deadline (~5s)', question && question.endsAt - question.serverNow > 4500 && question.endsAt - question.serverNow <= 5000, question && question.endsAt - question.serverNow)

  const progress = next(host, 'game:progress')
  const annAnswer = await emit(sa, 'player:answer', { gameId, index: 0, optionIds: [right1] })
  check('answer accepted without revealing correctness', annAnswer.ok === true && annAnswer.correct === undefined && annAnswer.points === undefined, annAnswer)
  check('host sees live progress', (await progress)?.answeredCount === 1, null)
  const twice = await emit(sa, 'player:answer', { gameId, index: 0, optionIds: [wrong1] })
  check('second answer to the same question is refused', twice.error === 'You already answered', twice)
  const invalid = await emit(sb, 'player:answer', { gameId, index: 0, optionIds: [right1, wrong1] })
  check('two picks on a single-choice question are refused', invalid.error === 'Pick one answer', invalid)
  await emit(sb, 'player:answer', { gameId, index: 0, optionIds: [wrong1] })
  await sleep(1500)
  const revealSeen = next(sa, 'game:reveal')
  const annResult = next(sa, 'game:result')
  const bobResult = next(sb, 'game:result')
  await emit(sc, 'player:answer', { gameId, index: 0, optionIds: [right1] })
  const reveal = await revealSeen
  check('everyone answered -> question closes early with the reveal', reveal?.index === 0 && reveal.options.find((o) => o.id === right1).correct === true, reveal)
  check('reveal shows the answer distribution', reveal?.distribution[right1] === 2 && reveal.distribution[wrong1] === 1 && reveal.answeredCount === 3, reveal?.distribution)
  const [ra, rb] = [await annResult, await bobResult]
  check('faster correct answer scores more (Kahoot formula, 500-1000)', ra?.correct && ra.points > 900 && ra.points <= 1000 && rb?.correct === false && rb.points === 0, { ra, rb })
  const catPoints = reveal?.leaderboard.find((p) => p.name === 'Cat')?.score
  check('leaderboard ranks by score: Ann ahead of Cat, Bob last', reveal?.leaderboard[0].name === 'Ann' && catPoints < ra.points && catPoints >= 500 && reveal.leaderboard[2].name === 'Bob', reveal?.leaderboard)
  const late = await emit(sb, 'player:answer', { gameId, index: 0, optionIds: [right1] })
  check('answers after the reveal are refused', late.error === 'Time is up for this question', late)

  // Question 2: only Ann answers; the server closes it when time runs out (no host action).
  const q2Seen = next(sa, 'game:question')
  await emit(host, 'host:next', { gameId })
  await q2Seen
  // Five taps at once: the Lua script lets exactly one through.
  const burst = await Promise.all(Array.from({ length: 5 }, () => emit(sa, 'player:answer', { gameId, index: 1, optionIds: right2 })))
  check('five simultaneous answers: exactly one is accepted', burst.filter((r) => r.ok).length === 1 && burst.filter((r) => r.error === 'You already answered').length === 4, burst)

  // Bob "refreshes" mid-question: a new socket rejoins with the same PIN.
  sb.close()
  const sb2 = await connect(bob.accessToken)
  const rejoin = await emit(sb2, 'player:join', { pin })
  check('a refreshed player rejoins mid-question', rejoin.ok && rejoin.status === 'question' && rejoin.question?.index === 1 && rejoin.answered === false, rejoin)
  const timedReveal = await next(sb2, 'game:reveal', 9000)
  check('server closes the question when time is up', timedReveal?.index === 1 && timedReveal.answeredCount === 1 && timedReveal.isLast === true, timedReveal)

  const ended = next(sa, 'game:ended')
  const annFinal = next(sa, 'game:final')
  const done = await emit(host, 'host:next', { gameId }) // no questions left -> ends
  const summary = await ended
  const final = await annFinal
  check('after the last question, "next" ends the game with a podium', done.ok && summary?.podium[0].name === 'Ann' && summary.playerCount === 3, summary)
  check('each player gets their final rank', final?.rank === 1 && final.correctCount === 2, final)

  const saved = await LiveGame.findById(gameId)
  check('results saved to MongoDB (standings + per-question stats)', saved.status === 'ended' && saved.results.players.length === 3 && saved.results.players[0].name === 'Ann' && saved.results.questions[0].correctCount === 2 && saved.results.questions[1].answeredCount === 1, saved?.results)
  const pinReuse = await emit(sc, 'player:join', { pin })
  check('the PIN stops working once the game ends', pinReuse.error === 'No game found with that PIN', pinReuse)

  const history = await call('GET', `/api/live-games?quizId=${quiz.id}`, null, T.accessToken)
  const details = await call('GET', `/api/live-games/${gameId}`, null, T.accessToken)
  const studentDetails = await call('GET', `/api/live-games/${gameId}`, null, ann.accessToken)
  const otherInstitute = await call('GET', `/api/live-games/${gameId}`, null, B.accessToken)
  check('teacher sees past games and full results; students and other institutes cannot', history.d.length === 1 && history.d[0].winner.name === 'Ann' && details.d.players.length === 3 && studentDetails.s === 403 && otherInstitute.s === 404, { history: history.d, studentDetails: studentDetails.s, otherInstitute: otherInstitute.s })

  // A second game: ending it from the lobby works, and active-game lookup reflects it.
  const g2 = (await call('POST', '/api/live-games', { quizId: quiz.id }, T.accessToken)).d
  const active = await call('GET', `/api/live-games/active?classId=${cls.id}`, null, ann.accessToken)
  check('students see the running game for their class', active.d.some((g) => g.id === g2.id && g.status === 'lobby'), active.d)
  await emit(host, 'host:join', { gameId: g2.id })
  const endEarly = await emit(host, 'host:end', { gameId: g2.id })
  const activeAfter = await call('GET', `/api/live-games/active?classId=${cls.id}`, null, ann.accessToken)
  check('host can end a game early; it disappears from active games', endEarly.ok && !activeAfter.d.some((g) => g.id === g2.id), { endEarly, activeAfter: activeAfter.d })

  for (const socket of [host, sa, sb2, sc, so]) socket.close()
  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
