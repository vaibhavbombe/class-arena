// Load scenario: one live quiz with N students on Socket.io.
//
// Each student connects, joins with the PIN and answers every question after a random
// "thinking" delay (a random option). Measured on the load generator's clock:
//   questionFanout  host sends "next" -> each student receives the question
//   answerAck       a student sends an answer -> the server's acknowledgement arrives
//   revealFanout    the last answer is sent -> each student receives the reveal (the question
//                   closes as soon as everyone has answered, before that last answer is acked)
//   errors          failed connects/joins/answers and missing events
const { summarize, connect, emit, sleep, pool, setupClass } = require('./common')

async function runLiveGame({ call, base, players, questions = 5, seconds = 20, thinkMs = [300, 2500] }) {
  const errors = []
  const { admin, cls, students } = await setupClass(call, { label: `game${players}`, count: players })

  const items = []
  for (let q = 0; q < questions; q++) {
    const question = await call('POST', '/api/questions', { type: 'mcq', prompt: `Load question ${q + 1}`, options: [{ text: 'A', correct: true }, { text: 'B' }, { text: 'C' }, { text: 'D' }] }, admin.accessToken)
    items.push({ questionId: question._id, seconds })
  }
  const quiz = await call('POST', '/api/live-quizzes', { classId: cls.id, title: `Load quiz ${players}` }, admin.accessToken)
  await call('PUT', `/api/live-quizzes/${quiz.id}`, { items }, admin.accessToken)
  const game = await call('POST', '/api/live-games', { quizId: quiz.id }, admin.accessToken)

  const host = await connect(base, admin.accessToken)
  const hostJoin = await emit(host, 'host:join', { gameId: game.id })
  if (!hostJoin.ok) throw new Error(`host:join failed: ${JSON.stringify(hostJoin)}`)

  // Connect and join in batches, like a class arriving over a few seconds.
  const connectStarted = Date.now()
  const sockets = await pool(players, 25, async (i) => {
    try {
      const socket = await connect(base, students[i].accessToken)
      const joined = await emit(socket, 'player:join', { pin: game.pin })
      if (!joined.ok) errors.push(`join ${i}: ${joined.error}`)
      return socket
    } catch (err) {
      errors.push(`connect ${i}: ${err.message}`)
      return null
    }
  })
  const joinAllMs = Date.now() - connectStarted
  const live = sockets.filter(Boolean)

  const questionFanout = []
  const answerAck = []
  const revealFanout = []
  for (let index = 0; index < questions; index++) {
    let lastSentAt = 0
    const reveals = live.map((socket) => new Promise((resolve) => {
      const timer = setTimeout(() => { errors.push(`q${index}: reveal not received`); resolve(null) }, (seconds + 10) * 1000)
      socket.once('game:reveal', () => { clearTimeout(timer); resolve(Date.now()) })
    }))
    const answered = live.map((socket) => new Promise((resolve) => {
      const timer = setTimeout(() => { errors.push(`q${index}: question not received`); resolve() }, 15000)
      socket.once('game:question', async (q) => {
        clearTimeout(timer)
        questionFanout.push(Date.now() - sentAt)
        await sleep(thinkMs[0] + Math.random() * (thinkMs[1] - thinkMs[0]))
        const optionIds = [q.options[Math.floor(Math.random() * q.options.length)].id]
        const before = Date.now()
        lastSentAt = Math.max(lastSentAt, before)
        const reply = await emit(socket, 'player:answer', { gameId: game.id, index, optionIds })
        const now = Date.now()
        if (reply?.ok) answerAck.push(now - before)
        else errors.push(`q${index}: answer ${reply?.error}`)
        resolve()
      })
    }))
    const sentAt = Date.now()
    const opened = await emit(host, 'host:next', { gameId: game.id })
    if (!opened.ok) errors.push(`q${index}: host:next ${opened.error}`)
    await Promise.all(answered)
    for (const at of await Promise.all(reveals)) if (at) revealFanout.push(at - lastSentAt)
  }

  await emit(host, 'host:next', { gameId: game.id }) // past the last question: ends the game
  for (const socket of [host, ...live]) socket.close()

  return {
    scenario: 'live-quiz',
    players,
    connected: live.length,
    questions,
    joinAllMs,
    questionFanoutMs: summarize(questionFanout),
    answerAckMs: summarize(answerAck),
    revealFanoutMs: summarize(revealFanout),
    answersAccepted: answerAck.length,
    answersExpected: players * questions,
    errors: errors.length,
    errorSamples: errors.slice(0, 5),
  }
}

module.exports = { runLiveGame }
