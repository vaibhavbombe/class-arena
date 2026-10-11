const { getRedis } = require('./redis')

// Rate limits with fixed-window counters in Redis (shared by every server instance, kept
// across restarts). Two kinds:
//   limitRequests  every request from one IP counts (generous: a classroom shares one IP)
//   failure limits only failures count (wrong password, wrong join code, wrong PIN), per
//                  target, so a real class never hits them but guessing stops quickly
// If Redis is missing or failing, requests are allowed (fail open): an outage of the limiter
// shouldn't take logins down with it. The error is logged.

const DISABLED = process.env.RATE_LIMITS_DISABLED === 'true'
if (DISABLED) console.warn('Rate limits are DISABLED (RATE_LIMITS_DISABLED=true). Only use this for tests.')

// INCR, and start the window on the first hit. Returns [count, ms left in the window].
const HIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { count, ttl }`

let defined = false
function redis() {
  const client = getRedis()
  if (client && !defined) {
    client.defineCommand('rateHit', { numberOfKeys: 1, lua: HIT })
    defined = true
  }
  return client
}

const keyFor = (name, id) => `rl:${name}:${String(id).toLowerCase()}`

async function hit(name, id, windowSec) {
  const client = redis()
  if (DISABLED || !client) return null
  try {
    const [count, ttl] = await client.rateHit(keyFor(name, id), String(windowSec * 1000))
    return { count, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) }
  } catch (err) {
    console.error(`Rate limit check failed (${name}):`, err.code || err.message)
    return null
  }
}

async function peek(name, id) {
  const client = redis()
  if (DISABLED || !client) return null
  try {
    const key = keyFor(name, id)
    const [count, ttl] = await client.multi().get(key).pttl(key).exec()
    return { count: Number(count[1] || 0), retryAfterSec: Math.max(1, Math.ceil(ttl[1] / 1000)) }
  } catch (err) {
    console.error(`Rate limit check failed (${name}):`, err.code || err.message)
    return null
  }
}

async function clear(name, id) {
  const client = redis()
  if (DISABLED || !client) return
  await client.del(keyFor(name, id)).catch(() => {})
}

function tooMany(res, retryAfterSec, message = 'Too many requests. Please wait and try again.') {
  res.set('Retry-After', String(retryAfterSec))
  const minutes = Math.ceil(retryAfterSec / 60)
  return res.status(429).json({ error: `${message} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` })
}

// Middleware: at most `limit` requests per IP per window for this route.
function limitRequests({ name, limit, windowSec, message }) {
  return async (req, res, next) => {
    const result = await hit(name, req.ip, windowSec)
    if (result && result.count > limit) return tooMany(res, result.retryAfterSec, message)
    next()
  }
}

// Failure limits: check before doing the work, record when it fails, clear on success.
// `rules` is a list of { name, id, limit, windowSec }; blocked if any rule is over its limit.
async function blockedBy(rules) {
  for (const rule of rules) {
    const current = await peek(rule.name, rule.id)
    if (current && current.count >= rule.limit) return current.retryAfterSec
  }
  return null
}

async function recordFailure(rules) {
  await Promise.all(rules.map((rule) => hit(rule.name, rule.id, rule.windowSec)))
}

module.exports = { limitRequests, blockedBy, recordFailure, clear, tooMany, hit }
