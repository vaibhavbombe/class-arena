const crypto = require('crypto')
const { getRedis } = require('../lib/redis')
const protocol = require('./protocol')

// API side of the judge. The API never runs student code: it puts jobs on a Redis queue
// and the worker process (judge/worker.js) publishes results. Two ways to use it:
//   judgeCode(job)   - wait for the result (staff "check with judge")
//   enqueue(job)     - fire and forget; results reach onJudgeResult handlers (student
//                      submissions are saved by such a handler, so nothing waits in a request)

const pending = new Map() // job id -> { resolve, timer }
const handlers = []
let subscriber = null

function requireRedis() {
  const redis = getRedis()
  if (!redis) {
    const err = new Error('The code judge needs Redis (REDIS_URL is not set)')
    err.status = 503
    throw err
  }
  return redis
}

async function getResult(id) {
  const raw = await requireRedis().get(protocol.resultKey(id)).catch(() => null)
  return raw ? JSON.parse(raw) : null
}

// Subscribes to "job done" messages. Called at startup so results published while no
// request is waiting (e.g. queued submissions) are still handled.
async function startJudgeListener() {
  if (subscriber) return subscriber
  const redis = requireRedis()
  subscriber = redis.duplicate()
  await subscriber.subscribe(protocol.channel())
  subscriber.on('message', async (_channel, id) => {
    const result = await getResult(id)
    const waiter = pending.get(id)
    if (waiter) {
      pending.delete(id)
      clearTimeout(waiter.timer)
      waiter.resolve(result)
      return
    }
    for (const handle of handlers) {
      try {
        await handle(id, result)
      } catch (err) {
        console.error('Judge result handler failed:', err)
      }
    }
  })
  return subscriber
}

function onJudgeResult(handle) {
  handlers.push(handle)
}

async function enqueue(job, id = crypto.randomUUID()) {
  await startJudgeListener()
  await requireRedis().lpush(protocol.QUEUE, JSON.stringify({ ...job, id }))
  return id
}

// Resolves with the judge's result, or rejects if the judge doesn't answer in time.
async function judgeCode(job, { timeoutMs = 45000 } = {}) {
  await startJudgeListener()
  const id = crypto.randomUUID()
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      pending.delete(id)
      // Published just before we gave up? Check once more before failing.
      const late = await getResult(id)
      if (late) return resolve(late)
      const err = new Error('The code judge is busy. Please try again in a moment.')
      err.status = 503
      reject(err)
    }, timeoutMs)
    pending.set(id, { resolve, timer })
  })
  await requireRedis().lpush(protocol.QUEUE, JSON.stringify({ ...job, id }))
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

module.exports = { judgeCode, enqueue, onJudgeResult, startJudgeListener, getResult, judgeStatus }
