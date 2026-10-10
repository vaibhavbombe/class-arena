// Starts the API on a spare port (email disabled), runs every integration suite against
// it in order, then stops it.   npm run test:integration
// Needs MONGODB_URI in server/.env pointing at a database whose name ends in -dev or -test.
const path = require('path')
const { spawn } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const SUITES = [
  'auth', 'classes', 'passwordReset', 'passwordRules', 'members',
  'questions', 'tests', 'attempts', 'results', 'raceSubmit', 'realtime', 'liveQuizzes', 'liveGame', 'analytics',
]
const PORT = process.env.INTEGRATION_PORT || '5099'

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

  // Email is switched off so the suites never send real messages.
  const server = runNode('server.js', { PORT, EMAIL_DISABLED: 'true', REDIS_PREFIX: 'test' }, { onOutput: () => {} })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start within 30s')), 30000)
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Server running')) {
        clearTimeout(timer)
        resolve()
      }
    })
    server.on('exit', (code) => reject(new Error(`Server exited early (code ${code})`)))
  })

  const results = []
  try {
    await ready
    console.log(`API running on port ${PORT} against database "${db}"\n`)
    for (const suite of SUITES) {
      console.log(`=== ${suite}`)
      const code = await new Promise((resolve) => {
        runNode(path.join('integration', `${suite}.js`), { API_URL: `http://localhost:${PORT}` }).on('exit', resolve)
      })
      results.push({ suite, ok: code === 0 })
      console.log()
    }
  } finally {
    server.kill()
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
