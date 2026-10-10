const express = require('express')
const mongoose = require('mongoose')
const LiveGame = require('../models/LiveGame')
const LiveQuiz = require('../models/LiveQuiz')
const { requireAuth, requireRole } = require('../middleware/auth')
const { findVisibleClass } = require('../lib/classAccess')
const store = require('../lib/liveGameStore')
const { generatePin } = require('../lib/liveGameRules')

// Starting games and reading their results over HTTP; playing happens over Socket.io.
const router = express.Router()
router.use(requireAuth)

const isStaff = (req) => req.role === 'teacher' || req.role === 'admin'

// Creates a game from a quiz: copies the questions (with the answer key) and reserves a PIN.
router.post('/', requireRole('teacher', 'admin'), async (req, res) => {
  const quizId = req.body?.quizId
  if (!mongoose.isValidObjectId(quizId)) return res.status(404).json({ error: 'Live quiz not found' })
  const quiz = await LiveQuiz.findOne({ _id: quizId, institutionId: req.institutionId })
  if (!quiz || !(await findVisibleClass(req, quiz.classId))) return res.status(404).json({ error: 'Live quiz not found' })
  if (!quiz.items.length) return res.status(400).json({ error: 'Add at least one question before starting a game' })

  const gameId = new mongoose.Types.ObjectId()
  const pin = await store.reservePin(gameId.toString(), generatePin)
  await store.createState(gameId.toString())
  await LiveGame.create({
    _id: gameId,
    institutionId: req.institutionId,
    classId: quiz.classId,
    quizId: quiz._id,
    hostId: req.userId,
    title: quiz.title,
    pin,
    items: quiz.items.map(({ seconds, type, prompt, options, explanation }) => ({ seconds, type, prompt, options, explanation })),
  })
  res.status(201).json({ id: gameId, pin })
})

// Games running now in a class (for the "Join" banner and the teacher's "Resume").
router.get('/active', async (req, res) => {
  const cls = await findVisibleClass(req, req.query.classId)
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const live = await LiveGame.find({ institutionId: req.institutionId, classId: cls._id, status: 'live' }).sort({ createdAt: -1 }).limit(10)
  const active = []
  for (const game of live) {
    const state = await store.getState(game.id) // expired Redis state = abandoned game
    if (state && state.status !== 'ended') active.push({ id: game._id, title: game.title, pin: game.pin, status: state.status })
  }
  res.json(active)
})

// Past games of a quiz, newest first (staff).
router.get('/', requireRole('teacher', 'admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.quizId)) return res.status(404).json({ error: 'Live quiz not found' })
  const quiz = await LiveQuiz.findOne({ _id: req.query.quizId, institutionId: req.institutionId })
  if (!quiz || !(await findVisibleClass(req, quiz.classId))) return res.status(404).json({ error: 'Live quiz not found' })
  const games = await LiveGame.find({ quizId: quiz._id, institutionId: req.institutionId, status: 'ended' }).sort({ createdAt: -1 }).limit(20)
  res.json(games.map((game) => ({
    id: game._id,
    playedAt: game.createdAt,
    playerCount: game.results?.players.length || 0,
    winner: game.results?.players[0] ? { name: game.results.players[0].name, score: game.results.players[0].score } : null,
  })))
})

// Full results of an ended game (staff of the class).
router.get('/:id', async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ error: 'You do not have permission to do this' })
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Game not found' })
  const game = await LiveGame.findOne({ _id: req.params.id, institutionId: req.institutionId })
  if (!game || !(await findVisibleClass(req, game.classId))) return res.status(404).json({ error: 'Game not found' })
  res.json({
    id: game._id,
    title: game.title,
    status: game.status,
    playedAt: game.createdAt,
    endedAt: game.endedAt,
    questions: game.items.map((item, index) => ({
      number: index + 1,
      prompt: item.prompt,
      options: item.options.map(({ id, text, correct }) => ({ id, text, correct })),
      ...(game.results ? { stats: game.results.questions[index] } : {}),
    })),
    players: game.results?.players || [],
  })
})

module.exports = router
