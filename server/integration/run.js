// Starts the API on a spare port (email disabled), runs every integration suite against
// it in order, then stops it.   npm run test:integration
// Needs MONGODB_URI in server/.env pointing at a database whose name ends in -dev or -test.
const path = require('path')
const { startMockAi, KEY } = require('./mockAi')
const { spawn } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const SUITES = [
  'auth', 'classes', 'passwordReset', 'passwordRules', 'members',
  'questions', 'tests', 'attempts', 'results', 'raceSubmit', 'realtime', 'liveQuizzes', 'liveGame', 'analytics', 'judge', 'codeQuestions', 'practice', 'codeInTests', 'contests', 'hints', 'generator', 'feedback', 'roles', 'rateLimits',
]
// Optional: npm run test:integration -- contests judge  (runs only those suites)
const ONLY = process.argv.slice(2)
const PORT = process.env.INTEGRATION_PORT || '5099'
const AI_PORT = process.env.INTEGRATION_AI_PORT || '5098'
const LIMITED_PORT = process.env.INTEGRATION_LIMITED_PORT || '5095'
// Suites that need rate limits switched on run against a second API with fresh counters.
const LIMITED_SUITES = ['rateLimits']

function databaseName(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

function runNode(file, env, { onOutput } = {}) {
  const child = spawn(process.execPath, [file], { cwd: path.join(__dirname, '..'), env: { ...process.env, ...env } })
  child.stdout.on('data', (chunk) => (onOutput ? onOutput(chunk.toString()) : process.stdout.write(chunk)))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return child
}

async function main() {
  const db = databaseName(process.env.MONGODB_URI || '')
  if (!/-(dev|test)$/.test(db)) {
    console.error(`Refusing to run: MONGODB_URI points at "${db || '?'}". Use a database whose name ends in -dev or -test.`)
    process.exit(1)
  }

  // Email is switched off so the suites never send real messages, and AI calls go to a local
  // fake (integration/mockAi.js): a real OPENROUTER_API_KEY in .env is never used or charged.
  const mockAi = await startMockAi(AI_PORT)
  const aiEnv = { OPENROUTER_API_KEY: KEY, AI_MODEL: 'mock/model', AI_BASE_URL: `http://localhost:${AI_PORT}/v1`, AI_DISABLED: 'false' }
  // The suites sign up hundreds of users from one IP, so rate limits are off for this API...
  const server = runNode('server.js', { PORT, EMAIL_DISABLED: 'true', REDIS_PREFIX: 'test', RATE_LIMITS_DISABLED: 'true', ...aiEnv }, { onOutput: () => {} })
  // ...and on for a second one used by the rate-limit suite, with a fresh key prefix.
  const limitedPrefix = `test-rl-${Date.now()}`
  const limited = runNode('server.js', { PORT: LIMITED_PORT, EMAIL_DISABLED: 'true', REDIS_PREFIX: limitedPrefix, AI_DISABLED: 'true', OPENROUTER_API_KEY: '' }, { onOutput: () => {} })
  const started = (child, name) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not start within 30s`)), 30000)
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Server running')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on('exit', (code) => reject(new Error(`${name} exited early (code ${code})`)))
  })
  const ready = Promise.all([started(server, 'Server'), started(limited, 'Rate-limited server')])

  const results = []
  try {
    await ready
    console.log(`API running on port ${PORT} against database "${db}"\n`)
    for (const suite of SUITES.filter((name) => !ONLY.length || ONLY.includes(name))) {
      console.log(`=== ${suite}`)
      const code = await new Promise((resolve) => {
        const env = LIMITED_SUITES.includes(suite)
          ? { API_URL: `http://localhost:${LIMITED_PORT}`, REDIS_PREFIX: limitedPrefix }
          : { API_URL: `http://localhost:${PORT}`, REDIS_PREFIX: 'test', AI_MOCK_URL: `http://localhost:${AI_PORT}` }
        runNode(path.join('integration', `${suite}.js`), env).on('exit', resolve)
      })
      results.push({ suite, ok: code === 0 })
      console.log()
    }
  } finally {
    server.kill()
    limited.kill()
    mockAi.close()
  }

  console.log('Summary')
  for (const { suite, ok } of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${suite}`)
  const failed = results.filter((r) => !r.ok).length
  console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${results.length} suites passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
