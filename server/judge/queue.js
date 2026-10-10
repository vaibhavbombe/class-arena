const crypto = require('crypto')
const { getRedis } = require('../lib/redis')
const protocol = require('./protocol')

// API side of the judge: put a job on the Redis queue and wait for the worker's result.
// The API never runs student code itself.

const pending = new Map() // job id -> { resolve, timer }
let subscriber = null

async function ensureSubscriber() {
  if (subscriber) return subscriber
  const redis = getRedis()
  if (!redis) {
    const err = new Error('The code judge needs Redis (REDIS_URL is not set)')
    err.status = 503
    throw err
  }
  subscriber = redis.duplicate()
  await subscriber.subscribe(protocol.channel())
  subscriber.on('message', async (_channel, id) => {
    const waiter = pending.get(id)
    if (!waiter) return
    pending.delete(id)
    clearTimeout(waiter.timer)
    const raw = await redis.get(protocol.resultKey(id)).catch(() => null)
    waiter.resolve(raw ? JSON.parse(raw) : null)
  })
  return subscriber
}

// Resolves with the judge's result, or rejects if the judge doesn't answer in time.
async function judgeCode(job, { timeoutMs = 45000 } = {}) {
  await ensureSubscriber()
  const redis = getRedis()
  const id = crypto.randomUUID()
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      pending.delete(id)
      // Published just before we gave up? Check once more before failing.
      const raw = await redis.get(protocol.resultKey(id)).catch(() => null)
      if (raw) return resolve(JSON.parse(raw))
      const err = new Error('The code judge is busy. Please try again in a moment.')
      err.status = 503
      reject(err)
    }, timeoutMs)
    pending.set(id, { resolve, timer })
  })
  await redis.lpush(protocol.QUEUE, JSON.stringify({ ...job, id }))
  return result
}

// For /api/health: is a worker alive and beating?
async function judgeStatus() {
  const redis = getRedis()
  if (!redis) return 'not configured'
  try {
    return (await redis.get(protocol.HEARTBEAT)) ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

module.exports = { judgeCode, judgeStatus }
