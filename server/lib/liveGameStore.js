const { getRedis } = require('./redis')

// Live game state in Redis (keys get the environment prefix from lib/redis.js).
//   game:{id}               hash   status, index, endsAt        (the state machine)
//   game:{id}:players       hash   studentId -> name
//   game:{id}:scores        zset   studentId -> total points    (the leaderboard)
//   game:{id}:answers:{i}   hash   studentId -> JSON answer for question i
//   pin:{pin}               string -> game id
// Correct answers are never stored here; they stay in MongoDB / server memory.

const TTL_SECONDS = 3 * 60 * 60 // games are short; everything expires on its own
const keys = {
  state: (id) => `game:${id}`,
  players: (id) => `game:${id}:players`,
  scores: (id) => `game:${id}:scores`,
  answers: (id, index) => `game:${id}:answers:${index}`,
  pin: (pin) => `pin:${pin}`,
}

// Compare-and-set on the state machine: only moves if the game is still where the caller
// thinks it is. A timer firing at the same moment as the teacher's "skip" can't both win.
const TRANSITION = `
if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] or redis.call('HGET', KEYS[1], 'index') ~= ARGV[2] then
  return 0
end
redis.call('HSET', KEYS[1], 'status', ARGV[3], 'index', ARGV[4], 'endsAt', ARGV[5])
return 1`

// Ends the game from any state except 'ended'.
const END = `
local status = redis.call('HGET', KEYS[1], 'status')
if not status or status == 'ended' then return 0 end
redis.call('HSET', KEYS[1], 'status', 'ended')
return 1`

// Accepts one answer atomically: the question must be the open one, the deadline (plus
// grace) not passed, the student a player, and this their first answer. Then adds the points.
// Returns the number of answers so far, or a negative code.
const ANSWER = `
if redis.call('HGET', KEYS[1], 'status') ~= 'question' or redis.call('HGET', KEYS[1], 'index') ~= ARGV[1] then
  return -1
end
if tonumber(ARGV[3]) > tonumber(redis.call('HGET', KEYS[1], 'endsAt')) + tonumber(ARGV[4]) then
  return -1
end
if redis.call('HEXISTS', KEYS[4], ARGV[2]) == 0 then
  return -3
end
if redis.call('HSETNX', KEYS[2], ARGV[2], ARGV[5]) == 0 then
  return -2
end
redis.call('EXPIRE', KEYS[2], ARGV[7])
redis.call('ZINCRBY', KEYS[3], ARGV[6], ARGV[2])
return redis.call('HLEN', KEYS[2])`

const ANSWER_ERRORS = { '-1': 'closed', '-2': 'already', '-3': 'not_player' }

let defined = false
function redis() {
  const client = getRedis()
  if (!client) {
    const err = new Error('Live games need Redis (REDIS_URL is not set)')
    err.status = 503
    throw err
  }
  if (!defined) {
    client.defineCommand('gameTransition', { numberOfKeys: 1, lua: TRANSITION })
    client.defineCommand('gameEnd', { numberOfKeys: 1, lua: END })
    client.defineCommand('gameAnswer', { numberOfKeys: 4, lua: ANSWER })
    defined = true
  }
  return client
}

// Reserves a unique PIN for the game (SET NX), trying a few random ones.
async function reservePin(gameId, makePin) {
  for (let tries = 0; tries < 10; tries++) {
    const pin = makePin()
    if (await redis().set(keys.pin(pin), gameId, 'EX', TTL_SECONDS, 'NX')) return pin
  }
  throw new Error('Could not reserve a game PIN')
}

async function createState(gameId) {
  await redis().multi()
    .hset(keys.state(gameId), 'status', 'lobby', 'index', '-1', 'endsAt', '0')
    .expire(keys.state(gameId), TTL_SECONDS)
    .exec()
}

async function getState(gameId) {
  const state = await redis().hgetall(keys.state(gameId))
  if (!state.status) return null
  return { status: state.status, index: Number(state.index), endsAt: Number(state.endsAt) }
}

async function gameIdForPin(pin) {
  return redis().get(keys.pin(pin))
}

async function transition(gameId, from, to) {
  const moved = await redis().gameTransition(keys.state(gameId), from.status, String(from.index), to.status, String(to.index), String(to.endsAt))
  return moved === 1
}

async function end(gameId) {
  return (await redis().gameEnd(keys.state(gameId))) === 1
}

async function addPlayer(gameId, studentId, name) {
  await redis().multi()
    .hset(keys.players(gameId), studentId, name)
    .zadd(keys.scores(gameId), 'NX', 0, studentId)
    .expire(keys.players(gameId), TTL_SECONDS)
    .expire(keys.scores(gameId), TTL_SECONDS)
    .exec()
}

async function players(gameId) {
  return redis().hgetall(keys.players(gameId)) // { studentId: name }
}

// Returns { count } or { error: 'closed' | 'already' | 'not_player' }.
async function recordAnswer(gameId, index, studentId, now, graceMs, answer) {
  const result = await redis().gameAnswer(
    keys.state(gameId), keys.answers(gameId, index), keys.scores(gameId), keys.players(gameId),
    String(index), studentId, String(now), String(graceMs), JSON.stringify(answer), String(answer.points), String(TTL_SECONDS),
  )
  return result > 0 ? { count: result } : { error: ANSWER_ERRORS[String(result)] }
}

async function answers(gameId, index) {
  const raw = await redis().hgetall(keys.answers(gameId, index))
  return Object.fromEntries(Object.entries(raw).map(([studentId, json]) => [studentId, JSON.parse(json)]))
}

// Everyone, highest score first: [{ studentId, score }]
async function ranking(gameId) {
  const flat = await redis().zrevrange(keys.scores(gameId), 0, -1, 'WITHSCORES')
  const result = []
  for (let i = 0; i < flat.length; i += 2) result.push({ studentId: flat[i], score: Number(flat[i + 1]) })
  return result
}

// After the game: the PIN is freed now; the rest lingers briefly so refreshed screens can
// still show the final standings.
async function cleanUp(gameId, pin, questionCount) {
  const linger = 10 * 60
  const multi = redis().multi().del(keys.pin(pin))
  for (const key of [keys.state(gameId), keys.players(gameId), keys.scores(gameId)]) multi.expire(key, linger)
  for (let i = 0; i < questionCount; i++) multi.expire(keys.answers(gameId, i), linger)
  await multi.exec()
}

module.exports = {
  keys, reservePin, createState, getState, gameIdForPin, transition, end,
  addPlayer, players, recordAnswer, answers, ranking, cleanUp,
}
