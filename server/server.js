require('dotenv').config()
const http = require('http')
const express = require('express')
const cors = require('cors')
const connectMongo = require('./config/mongo')
const { getRedis, redisStatus } = require('./lib/redis')
const { attachRealtime } = require('./realtime')
const { startJudgeWorker } = require('./judge/supervisor')
const { judgeStatus, startJudgeListener } = require('./judge/queue')
const { aiConfig, describeConfig, lastAiFailure } = require('./lib/ai/client')

const app = express()
// Behind Render's proxy the client IP is in X-Forwarded-For. Trust exactly as many proxy hops
// as there are, so req.ip (used by rate limits) is the real client and can't be spoofed by
// sending a fake X-Forwarded-For. Locally there is no proxy.
// Measured on Render (Oct 2026): a request arrives with 3 X-Forwarded-For entries (client + 2
// proxies), so 3 hops are trusted there. Re-check (e.g. with a temporary endpoint) if hosting changes.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? (process.env.RENDER ? 3 : 0)))
// credentials: the browser may send the refresh-token cookie (only to /api/auth/*; see lib/authCookie.js).
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())

// For Render's health check. No database call, so it stays cheap.
// `commit` (set by Render) shows which version is live; the repo is public, so it's not secret.
app.get('/api/health', async (req, res) => res.json({
  ok: true,
  commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
  redis: redisStatus(),
  judge: await judgeStatus(), // is a judge worker alive (heartbeat in Redis)?
  ai: aiConfig().enabled ? 'on' : 'off', // hints fall back to fixed text when off
  aiModel: aiConfig().enabled ? aiConfig().model : undefined,
  aiLastError: lastAiFailure() || undefined, // reason code + time only
}))

app.use('/api/auth', require('./routes/auth'))
app.use('/api/classes', require('./routes/classes'))
app.use('/api/questions', require('./routes/questions'))
app.use('/api/live-quizzes', require('./routes/liveQuizzes'))
app.use('/api/live-games', require('./routes/liveGames'))
app.use('/api/problems', require('./routes/problems'))
app.use('/api/contests', require('./routes/contests'))
// Before /api/tests, so attempt URLs never pass through the tests router first.
app.use('/api/tests/:testId/attempt', require('./routes/attempts'))
app.use('/api/tests', require('./routes/tests'))
app.use('/api', require('./routes/institute'))

// Catch-all error handler. Log details on the server,
// send only a generic message to the client (no stack traces).
// Express 5 forwards errors thrown in async handlers here automatically.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' })
  }
  if (err.status === 503) {
    // A dependency (e.g. Redis) isn't configured; the message is written to be safe to show.
    return res.status(503).json({ error: err.message })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Server error' })
})

// One HTTP server shared by Express and Socket.io (same port, so Render needs no extra setup).
const httpServer = http.createServer(app)
attachRealtime(httpServer)

const PORT = process.env.PORT || 5002
connectMongo()
  .then(() => {
    getRedis() // connects in the background; /api/health reports its status
    console.log(describeConfig())
    startJudgeWorker() // separate process that runs student code (judge/worker.js)
    if (process.env.REDIS_URL) startJudgeListener().catch((err) => console.error('Judge listener failed to start:', err.message))
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch((err) => {
    console.error('Startup failed:', err)
    process.exit(1)
  })
