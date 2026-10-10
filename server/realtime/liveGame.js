const mongoose = require('mongoose')
const LiveGame = require('../models/LiveGame')
const Class = require('../models/Class')
const Enrollment = require('../models/Enrollment')
const store = require('../lib/liveGameStore')
const rules = require('../lib/liveGameRules')

// The live game engine. The server decides everything: when a question opens and closes,
// whether an answer counts, and how many points it earns. Clients only display.
//
// Rooms:  game:{id}        everyone in the game (host + players)
//         game:{id}:host   the host's screen(s)
//         game:{id}:p:{uid} one player's screen(s)

let io = null
const timers = new Map() // gameId -> timeout that closes the open question
const games = new Map() // gameId -> LiveGame doc (cached: holds the answer key)
const LEADERBOARD_SIZE = 5

async function loadGame(gameId) {
  if (games.has(gameId)) return games.get(gameId)
  if (!mongoose.isValidObjectId(gameId)) return null
  const game = await LiveGame.findById(gameId)
  if (game && game.status === 'live') games.set(gameId, game)
  return game
}

const room = (gameId) => `game:${gameId}`
const hostRoom = (gameId) => `game:${gameId}:host`
const playerRoom = (gameId, studentId) => `game:${gameId}:p:${studentId}`

async function leaderboard(gameId, size = LEADERBOARD_SIZE) {
  const [ranking, names] = await Promise.all([store.ranking(gameId), store.players(gameId)])
  return ranking.slice(0, size).map((entry, i) => ({ rank: i + 1, name: names[entry.studentId] || 'Player', score: entry.score }))
}

async function playerList(gameId) {
  const names = await store.players(gameId)
  return Object.values(names).sort((a, b) => a.localeCompare(b))
}

// What everyone sees when a question closes: the right answer, how the class answered,
// and the top of the leaderboard.
async function revealPayload(game, index) {
  const item = game.items[index]
  const answerMap = await store.answers(game.id, index)
  const playerCount = Object.keys(await store.players(game.id)).length
  return {
    index,
    number: index + 1,
    total: game.items.length,
    prompt: item.prompt,
    options: item.options.map(({ id, text, correct }) => ({ id, text, correct })),
    explanation: item.explanation || '',
    distribution: rules.distribution(item, Object.values(answerMap)),
    answeredCount: Object.keys(answerMap).length,
    playerCount,
    leaderboard: await leaderboard(game.id),
    isLast: index === game.items.length - 1,
  }
}

// One player's own result for a question, plus total score and rank.
async function personalResult(game, index, studentId, answerMap, ranking) {
  const answer = answerMap[studentId]
  const position = ranking.findIndex((entry) => entry.studentId === studentId)
  return {
    index,
    answered: Boolean(answer),
    correct: Boolean(answer?.correct),
    points: answer?.points || 0,
    score: position >= 0 ? ranking[position].score : 0,
    rank: position >= 0 ? position + 1 : null,
    playerCount: ranking.length,
  }
}

function clearTimer(gameId) {
  clearTimeout(timers.get(gameId))
  timers.delete(gameId)
}

async function openNextQuestion(game) {
  const state = await store.getState(game.id)
  if (!state || !['lobby', 'reveal'].includes(state.status)) return { error: 'Not ready for the next question' }
  const nextIndex = state.index + 1
  if (nextIndex >= game.items.length) return endGame(game)

  const now = Date.now()
  const endsAt = now + game.items[nextIndex].seconds * 1000
  const moved = await store.transition(game.id, state, { status: 'question', index: nextIndex, endsAt })
  if (!moved) return { error: 'The game moved on already' }

  io.to(room(game.id)).emit('game:question', rules.questionForPlayers(game.items[nextIndex], nextIndex, game.items.length, endsAt, now))
  io.to(hostRoom(game.id)).emit('game:progress', { index: nextIndex, answeredCount: 0, playerCount: Object.keys(await store.players(game.id)).length })

  // Close the question once its time (plus the network grace) is up.
  clearTimer(game.id)
  timers.set(game.id, setTimeout(() => {
    closeQuestion(game, nextIndex).catch((err) => console.error('Closing question failed:', err))
  }, endsAt - now + rules.ANSWER_GRACE_MS))
  return { ok: true }
}

async function closeQuestion(game, index) {
  const state = await store.getState(game.id)
  if (!state || state.status !== 'question' || state.index !== index) return { error: 'No open question' }
  const moved = await store.transition(game.id, state, { status: 'reveal', index, endsAt: state.endsAt })
  if (!moved) return { error: 'The question was already closed' }
  clearTimer(game.id)

  const payload = await revealPayload(game, index)
  io.to(room(game.id)).emit('game:reveal', payload)

  const [answerMap, ranking] = await Promise.all([store.answers(game.id, index), store.ranking(game.id)])
  for (const { studentId } of ranking) {
    io.to(playerRoom(game.id, studentId)).emit('game:result', await personalResult(game, index, studentId, answerMap, ranking))
  }
  return { ok: true }
}

// Final standings and per-question stats go to MongoDB; Redis keys then expire.
async function endGame(game) {
  if (!(await store.end(game.id))) return { error: 'The game has already ended' }
  clearTimer(game.id)

  const [ranking, names] = await Promise.all([store.ranking(game.id), store.players(game.id)])
  const correctCounts = {}
  const questions = []
  for (let index = 0; index < game.items.length; index++) {
    const answerMap = await store.answers(game.id, index)
    const list = Object.entries(answerMap)
    for (const [studentId, answer] of list) if (answer.correct) correctCounts[studentId] = (correctCounts[studentId] || 0) + 1
    questions.push({
      index,
      prompt: game.items[index].prompt,
      answeredCount: list.length,
      correctCount: list.filter(([, answer]) => answer.correct).length,
      distribution: rules.distribution(game.items[index], list.map(([, answer]) => answer)),
    })
  }
  const players = ranking.map((entry, i) => ({
    studentId: entry.studentId,
    name: names[entry.studentId] || 'Player',
    score: entry.score,
    correctCount: correctCounts[entry.studentId] || 0,
    rank: i + 1,
  }))

  await LiveGame.updateOne({ _id: game.id }, { status: 'ended', endedAt: new Date(), results: { players, questions } })
  games.delete(game.id)

  const summary = { podium: players.slice(0, 3).map(({ name, score, rank }) => ({ name, score, rank })), leaderboard: players.slice(0, 10).map(({ name, score, rank }) => ({ name, score, rank })), playerCount: players.length, questionCount: game.items.length }
  io.to(room(game.id)).emit('game:ended', summary)
  for (const player of players) {
    io.to(playerRoom(game.id, player.studentId)).emit('game:final', { rank: player.rank, score: player.score, correctCount: player.correctCount, playerCount: players.length, questionCount: game.items.length })
  }
  await store.cleanUp(game.id, game.pin, game.items.length)
  return { ok: true }
}

// If the server restarted (losing its timer) or a timer is late, the next event that
// looks at the game closes an overdue question.
async function settleIfOverdue(game) {
  const state = await store.getState(game.id)
  if (state?.status === 'question' && Date.now() > state.endsAt + rules.ANSWER_GRACE_MS) {
    await closeQuestion(game, state.index)
    return store.getState(game.id)
  }
  return state
}

// Snapshot for a screen that (re)connects mid-game.
async function snapshot(game, studentId) {
  const state = await settleIfOverdue(game)
  const base = { gameId: game.id, title: game.title, total: game.items.length, status: state?.status || 'ended', players: await playerList(game.id) }
  if (!state) return base
  if (state.status === 'lobby') return base
  if (state.status === 'question') {
    const view = { ...base, question: rules.questionForPlayers(game.items[state.index], state.index, game.items.length, state.endsAt, Date.now()) }
    if (studentId) view.answered = Boolean((await store.answers(game.id, state.index))[studentId])
    else view.progress = { answeredCount: Object.keys(await store.answers(game.id, state.index)).length, playerCount: base.players.length }
    return view
  }
  if (state.status === 'reveal') {
    const view = { ...base, reveal: await revealPayload(game, state.index) }
    if (studentId) {
      const [answerMap, ranking] = await Promise.all([store.answers(game.id, state.index), store.ranking(game.id)])
      view.result = await personalResult(game, state.index, studentId, answerMap, ranking)
    }
    return view
  }
  return base
}

async function canHost(identity, game) {
  if (game.institutionId.toString() !== identity.institutionId) return false
  if (identity.role === 'admin') return true
  if (identity.role !== 'teacher') return false
  return Boolean(await Class.exists({ _id: game.classId, teacherId: identity.userId }))
}

// Wraps a socket handler: validates the ack, catches errors, never leaks details.
function handler(fn) {
  return async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    try {
      reply(await fn(payload ?? {}))
    } catch (err) {
      console.error('Live game error:', err)
      reply({ error: err.status === 503 ? err.message : 'Something went wrong' })
    }
  }
}

function registerLiveGame(socket) {
  const identity = socket.data.user
  const hosting = new Set()

  socket.on('host:join', handler(async ({ gameId }) => {
    const game = await loadGame(String(gameId))
    if (!game || !(await canHost(identity, game))) return { error: 'Game not found' }
    if (game.status === 'ended') return { error: 'This game has ended', ended: true }
    hosting.add(game.id)
    socket.join([room(game.id), hostRoom(game.id)])
    return { ok: true, pin: game.pin, ...(await snapshot(game)) }
  }))

  const hostAction = (action) => handler(async ({ gameId }) => {
    const id = String(gameId)
    if (!hosting.has(id)) return { error: 'You are not hosting this game' }
    const game = await loadGame(id)
    if (!game || game.status === 'ended') return { error: 'This game has ended' }
    return action(game)
  })
  socket.on('host:next', hostAction(openNextQuestion))
  socket.on('host:skip', hostAction(async (game) => {
    const state = await store.getState(game.id)
    return state?.status === 'question' ? closeQuestion(game, state.index) : { error: 'No open question' }
  }))
  socket.on('host:end', hostAction(endGame))

  socket.on('player:join', handler(async ({ pin }) => {
    if (identity.role !== 'student') return { error: 'Only students can join as players' }
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return { error: 'Enter the 6-digit game PIN' }
    const gameId = await store.gameIdForPin(pin)
    const game = gameId && await loadGame(gameId)
    // Same answer for "no such PIN" and "not your class", so PINs can't be probed across classes.
    if (!game || game.status === 'ended' || game.institutionId.toString() !== identity.institutionId) return { error: 'No game found with that PIN' }
    if (!(await Enrollment.exists({ classId: game.classId, studentId: identity.userId }))) return { error: 'No game found with that PIN' }

    await store.addPlayer(game.id, identity.userId, identity.name)
    socket.data.playing = game.id
    socket.join([room(game.id), playerRoom(game.id, identity.userId)])
    io.to(hostRoom(game.id)).emit('game:players', { players: await playerList(game.id) })
    return { ok: true, you: { name: identity.name }, ...(await snapshot(game, identity.userId)) }
  }))

  socket.on('player:answer', handler(async ({ gameId, index, optionIds }) => {
    const id = String(gameId)
    if (socket.data.playing !== id) return { error: 'Join the game first' }
    const game = await loadGame(id)
    if (!game || game.status === 'ended') return { error: 'This game has ended' }
    if (!Number.isInteger(index) || index < 0 || index >= game.items.length) return { error: 'Unknown question' }

    const item = game.items[index]
    const choice = rules.parseChoice(item, optionIds)
    if (choice.error) return { error: choice.error }

    const state = await store.getState(id)
    if (!state || state.status !== 'question' || state.index !== index) return { error: 'Time is up for this question' }
    const now = Date.now()
    const elapsedMs = now - (state.endsAt - item.seconds * 1000)
    const correct = rules.isCorrectChoice(item, choice.optionIds)
    const points = rules.pointsFor(correct, elapsedMs, item.seconds * 1000)

    const result = await store.recordAnswer(id, index, identity.userId, now, rules.ANSWER_GRACE_MS, { optionIds: choice.optionIds, elapsedMs, correct, points })
    if (result.error === 'already') return { error: 'You already answered' }
    if (result.error === 'closed') return { error: 'Time is up for this question' }
    if (result.error) return { error: 'Join the game first' }

    // Live progress for the teacher's chart, then close early once everyone has answered.
    const answerMap = await store.answers(id, index)
    const playerCount = Object.keys(await store.players(id)).length
    io.to(hostRoom(id)).emit('game:progress', { index, answeredCount: result.count, playerCount, distribution: rules.distribution(item, Object.values(answerMap)) })
    if (result.count >= playerCount) await closeQuestion(game, index)
    // Correctness and points stay hidden until the reveal.
    return { ok: true }
  }))
}

function initLiveGames(server) {
  io = server
}

module.exports = { initLiveGames, registerLiveGame, loadGame }
