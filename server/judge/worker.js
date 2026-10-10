// The judge worker: a separate process (started by judge/supervisor.js) that takes jobs
// from the Redis queue, runs student code in V8 isolates (judge/runner.js) and publishes
// the result. Its environment holds only the Redis connection: no database URL, JWT
// secret or email keys, so even a sandbox escape would find nothing useful here.
const Redis = require('ioredis')
const { runSubmission } = require('./runner')
const protocol = require('./protocol')

const redis = new Redis(process.env.REDIS_URL, { keyPrefix: `${protocol.prefix()}:`, maxRetriesPerRequest: null })
redis.on('error', (err) => console.error('Judge worker Redis error:', err.code || err.message))
const send = (message) => process.send && process.send(message)

async function heartbeat() {
  try {
    await redis.set(protocol.HEARTBEAT, String(Date.now()), 'EX', protocol.HEARTBEAT_SECONDS * 3)
  } catch {
    // Redis hiccup: the next beat will try again.
  }
}

async function main() {
  await heartbeat()
  setInterval(heartbeat, protocol.HEARTBEAT_SECONDS * 1000).unref()
  send({ type: 'ready' })

  for (;;) {
    const item = await redis.brpop(protocol.QUEUE, 5) // blocks up to 5s, then loops
    if (!item) continue

    let job
    try {
      job = JSON.parse(item[1])
    } catch {
      continue // not a job we understand
    }
    send({ type: 'start', id: job.id })
    let result
    try {
      result = await runSubmission(job)
    } catch (err) {
      console.error('Judge job failed:', err.message)
      result = { verdict: 'Judge Error', passed: 0, total: 0, tests: [], error: 'The judge could not run this submission' }
    }
    await redis.set(protocol.resultKey(job.id), JSON.stringify(result), 'EX', protocol.RESULT_TTL_SECONDS)
    await redis.publish(protocol.channel(), job.id)
    send({ type: 'done', id: job.id })
  }
}

main().catch((err) => {
  console.error('Judge worker crashed:', err)
  process.exit(1) // the supervisor starts a fresh one
})
