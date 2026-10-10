const path = require('path')
const { fork } = require('child_process')
const { getRedis } = require('../lib/redis')
const protocol = require('./protocol')

// Runs the judge worker as a child process of the API and keeps it alive:
// restarts it if it exits (with backoff), and kills it if one job runs past the
// watchdog limit, recording a "Judge Error" for that job so the student isn't left waiting.

const WATCHDOG_MS = 30000
const MAX_BACKOFF_MS = 30000

// Least privilege: the worker gets only what it needs to talk to Redis.
function workerEnv(env) {
  const allowed = ['REDIS_URL', 'PATH', 'SystemRoot', 'TEMP', 'TMP']
  const out = Object.fromEntries(allowed.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]))
  out.REDIS_PREFIX = protocol.prefix()
  out.NODE_ENV = env.NODE_ENV || 'production'
  return out
}

function startJudgeWorker() {
  if (!process.env.REDIS_URL) {
    console.warn('Judge worker not started: REDIS_URL is not set')
    return
  }
  let backoff = 1000
  let stopped = false
  let child = null

  function launch() {
    const startedAt = Date.now()
    child = fork(path.join(__dirname, 'worker.js'), [], {
      execArgv: ['--no-node-snapshot'], // isolated-vm requirement on Node 20+
      env: workerEnv(process.env),
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    let watchdog = null

    child.on('message', (message) => {
      if (message?.type === 'ready') console.log('Judge worker ready')
      if (message?.type === 'start') {
        clearTimeout(watchdog)
        watchdog = setTimeout(async () => {
          console.error(`Judge worker stuck on job ${message.id}; restarting it`)
          child.kill('SIGKILL')
          try {
            await getRedis().set(protocol.resultKey(message.id), JSON.stringify({ verdict: 'Judge Error', passed: 0, total: 0, tests: [], error: 'The judge took too long and was restarted' }), 'EX', protocol.RESULT_TTL_SECONDS)
            await getRedis().publish(protocol.channel(), message.id)
          } catch (err) {
            console.error('Could not record the stuck job:', err.message)
          }
        }, WATCHDOG_MS)
      }
      if (message?.type === 'done') clearTimeout(watchdog)
    })

    child.on('exit', (code, signal) => {
      clearTimeout(watchdog)
      if (stopped) return
      // A worker that ran for a while gets a quick restart; one crashing on start backs off.
      backoff = Date.now() - startedAt > 60000 ? 1000 : Math.min(backoff * 2, MAX_BACKOFF_MS)
      console.error(`Judge worker exited (${signal || code}); restarting in ${backoff} ms`)
      setTimeout(launch, backoff).unref()
    })
  }

  launch()
  const stop = () => {
    stopped = true
    child?.kill()
  }
  process.once('exit', stop)
  return { stop }
}

module.exports = { startJudgeWorker, workerEnv, WATCHDOG_MS }
