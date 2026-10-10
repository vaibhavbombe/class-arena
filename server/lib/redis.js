const Redis = require('ioredis')

// One shared Redis connection for live game state (rooms, players, leaderboards).
// Redis only ever holds short-lived state; anything permanent goes to MongoDB, and
// correct answers are never stored here.

// Every key is prefixed with the environment, so local development, integration tests
// and production can share one Redis database without seeing each other's data.
const PREFIX = process.env.REDIS_PREFIX || (process.env.RENDER ? 'prod' : 'dev')

let client = null

function getRedis() {
  if (client || !process.env.REDIS_URL) return client
  const url = process.env.REDIS_URL.trim()

  if (process.env.RENDER && !url.startsWith('rediss://')) {
    // The connection would cross the internet unencrypted, password included.
    console.warn('REDIS_URL is not encrypted (redis:// instead of rediss://). Use a TLS URL in production.')
  }

  client = new Redis(url, {
    keyPrefix: `${PREFIX}:`,
    // Fail commands fast instead of queueing them forever while Redis is unreachable.
    maxRetriesPerRequest: 2,
    connectTimeout: 10000,
  })
  client.on('ready', () => console.log(`Redis connected (key prefix "${PREFIX}:")`))
  client.on('error', (err) => console.error('Redis error:', err.code || err.message))
  return client
}

// For /api/health: 'ok', 'connecting', 'down' or 'not configured'.
function redisStatus() {
  if (!process.env.REDIS_URL) return 'not configured'
  const status = getRedis().status
  if (status === 'ready') return 'ok'
  if (['connecting', 'connect', 'reconnecting', 'wait'].includes(status)) return 'connecting'
  return 'down'
}

module.exports = { getRedis, redisStatus, PREFIX }
