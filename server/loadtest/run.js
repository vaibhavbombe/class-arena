// Load test runner. Starts its own API (email and AI off, Redis keys under "test:"), runs the
// scenarios, prints a summary and saves the numbers to loadtest/results/.
//
//   npm run loadtest                                   (defaults below)
//   npm run loadtest -- --players=50,100,200 --submitters=50
//
// Safety: refuses databases whose names don't end in -dev or -test (it creates data), and runs
// against its own local API. The load generator and the API share this machine, so results
// describe this machine, not the hosted service.
const path = require('path')
const os = require('os')
const fs = require('fs')
const { spawn } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const mongoose = require('mongoose')
const { makeClient } = require('./common')
const { runLiveGame } = require('./liveGameLoad')
const { runJudge } = require('./judgeLoad')

const PORT = process.env.LOADTEST_PORT || '5096'
const BASE = `http://localhost:${PORT}`
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const PLAYERS = arg('players', '50,100,200').split(',').map(Number).filter(Boolean)
const SUBMITTERS = arg('submitters', '50').split(',').map(Number).filter(Boolean)
const QUESTIONS = Number(arg('questions', '5'))

function databaseName(uri) {
  try { return new URL(uri).pathname.replace(/^\//, '') } catch { return '' }
}

function startApi() {
  const child = spawn(process.execPath, ['--no-node-snapshot', 'server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, EMAIL_DISABLED: 'true', REDIS_PREFIX: 'test', AI_DISABLED: 'true', OPENROUTER_API_KEY: '' },
  })
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API did not start within 30s')), 30000)
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Server running')) { clearTimeout(timer); resolve(child) }
    })
    child.on('exit', (code) => reject(new Error(`API exited early (code ${code})`)))
  })
}

const row = (name, s) => `| ${name} | ${s.count} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.max} |`

;(async () => {
  const db = databaseName(process.env.MONGODB_URI || '')
  if (!/-(dev|test)$/.test(db)) {
    console.error(`Refusing to run: the database "${db || '?'}" doesn't end in -dev or -test.`)
    process.exit(1)
  }
  const environment = {
    date: new Date().toISOString(),
    cpu: `${os.cpus()[0].model.trim()} (${os.cpus().length} logical cores)`,
    memoryGb: Math.round(os.totalmem() / 1e9),
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    api: 'local, same machine as the load generator',
    database: process.env.MONGODB_URI.startsWith('mongodb+srv') ? 'MongoDB Atlas (remote)' : 'MongoDB',
    redis: /upstash/.test(process.env.REDIS_URL || '') ? 'Upstash Redis (remote, TLS)' : 'Redis',
  }

  await mongoose.connect(process.env.MONGODB_URI)
  const api = await startApi()
  const call = makeClient(BASE)
  const results = []
  try {
    for (const players of PLAYERS) {
      console.log(`live quiz: ${players} players, ${QUESTIONS} questions...`)
      results.push(await runLiveGame({ call, base: BASE, players, questions: QUESTIONS }))
      console.log(JSON.stringify(results.at(-1)))
    }
    for (const submitters of SUBMITTERS) {
      console.log(`contest judge: ${submitters} simultaneous submissions...`)
      results.push(await runJudge({ call, submitters }))
      console.log(JSON.stringify(results.at(-1)))
    }
  } finally {
    api.kill()
    await mongoose.disconnect()
  }

  const lines = ['# Load test results', '', `Run ${environment.date} on ${environment.cpu}, ${environment.memoryGb} GB RAM, ${environment.os}, Node ${environment.node}.`, `API: ${environment.api}; ${environment.database}; ${environment.redis}.`, '']
  for (const r of results) {
    if (r.scenario === 'live-quiz') {
      lines.push(`## Live quiz: ${r.players} players, ${r.questions} questions`, '', `Connected ${r.connected}/${r.players} (all joined in ${r.joinAllMs} ms); answers accepted ${r.answersAccepted}/${r.answersExpected}; errors ${r.errors}.`, '', '| ms | samples | p50 | p95 | p99 | max |', '|---|---|---|---|---|---|', row('question reaches player', r.questionFanoutMs), row('answer acknowledged', r.answerAckMs), row('reveal after last answer', r.revealFanoutMs), '')
    } else {
      lines.push(`## Contest judge: ${r.submitters} simultaneous submissions`, '', `${r.mix}; ${r.testsPerSubmission} tests each, ${r.timeLimitMs} ms limit. Judged ${r.judged}/${r.submitters} in ${r.drainMs} ms (${r.throughputPerSecond} submissions/s); verdicts ${JSON.stringify(r.verdicts)}; wrong verdicts ${r.wrongVerdicts}; errors ${r.errors}.`, '', '| ms | samples | p50 | p95 | p99 | max |', '|---|---|---|---|---|---|', row('submit acknowledged (202)', r.submitAckMs), row('queued -> verdict saved', r.queueToVerdictMs), '')
    }
  }
  const outDir = path.join(__dirname, 'results')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = environment.date.slice(0, 16).replace(/[:T]/g, '-')
  fs.writeFileSync(path.join(outDir, `${stamp}.json`), JSON.stringify({ environment, results }, null, 2))
  fs.writeFileSync(path.join(outDir, `${stamp}.md`), lines.join('\n'))
  console.log(`\n${lines.join('\n')}\n\nSaved to loadtest/results/${stamp}.{json,md}`)
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
