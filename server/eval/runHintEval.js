// Evaluates hints with the real model, using exactly the production prompt, validation and
// retry (lib/ai/hints.js + lib/ai/client.js). No database or server needed.
//
//   node eval/runHintEval.js                 level 1 for every case (needs OPENROUTER_API_KEY in .env)
//   node eval/runHintEval.js --levels=1,2    also level 2 (the level-1 hint is passed as "already given")
//   node eval/runHintEval.js --mock          the fake AI server instead (tests this script, costs nothing)
//
// Per hint it records: did the AI give one (or did the standard hint take over), is it a question,
// does it contain code, is it on target, does it leak the fix (keywords in eval/hintCases.js).
// Results go to eval/results/ (JSON + a Markdown table with every hint, for a human to read).
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const { aiConfig, chatJSON } = require('../lib/ai/client')
const hints = require('../lib/ai/hints')
const CASES = require('./hintCases')

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const LEVELS = arg('levels', '1').split(',').map(Number)
const MOCK = process.argv.includes('--mock')
const PAUSE_MS = Number(arg('pause', MOCK ? '0' : '4000')) // free models allow ~20 requests a minute
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const has = (text, words) => words.filter((w) => text.toLowerCase().includes(w.toLowerCase()))

;(async () => {
  let config = aiConfig()
  let mockServer = null
  if (MOCK) {
    const { startMockAi, KEY } = require('../integration/mockAi')
    mockServer = await startMockAi(5093)
    config = aiConfig({ OPENROUTER_API_KEY: KEY, AI_MODEL: 'mock/model', AI_BASE_URL: 'http://localhost:5093/v1' })
  }
  if (!config.enabled) {
    console.error('No OPENROUTER_API_KEY in server/.env (or AI_DISABLED=true). Add the key, or run with --mock.')
    process.exit(1)
  }
  console.log(`Evaluating levels ${LEVELS.join(', ')} on ${CASES.length} cases with ${config.models.join(', ')}`)

  const rows = []
  for (const c of CASES) {
    const previous = []
    for (const level of LEVELS) {
      const problem = { title: c.title, prompt: c.prompt, functionName: c.functionName, sampleTests: c.sampleTests }
      const result = await chatJSON({
        messages: hints.buildHintMessages({ problem, level, code: c.code, latest: c.latest, previous }),
        validate: (data) => hints.validateHint(data, c.functionName, level),
        maxTokens: 300,
        config,
      })
      const text = result.ok ? result.data.hint.trim() : null
      const row = {
        case: c.id,
        level,
        aiAnswered: result.ok,
        reason: result.ok ? null : result.reason,
        model: result.ok ? result.model : null,
        hint: text,
        isQuestion: text ? text.includes('?') : null,
        hasCode: text ? hints.looksLikeSolution(text, c.functionName) : null,
        onTarget: text ? has(text, c.onTarget) : null,
        leaks: text ? has(text, c.leaks) : null,
      }
      rows.push(row)
      if (text) previous.push(text)
      console.log(`${c.id} L${level}: ${text ? `${row.leaks.length ? 'LEAK ' : ''}${row.onTarget.length ? 'on-target ' : ''}${text}` : `(no AI hint: ${row.reason})`}`)
      await sleep(PAUSE_MS)
    }
  }
  mockServer?.close()

  const summary = LEVELS.map((level) => {
    const at = rows.filter((r) => r.level === level)
    const answered = at.filter((r) => r.aiAnswered)
    const pct = (n) => (answered.length ? `${Math.round((n / answered.length) * 100)}%` : '-')
    return {
      level,
      cases: at.length,
      aiAnswered: answered.length,
      questions: `${answered.filter((r) => r.isQuestion).length} (${pct(answered.filter((r) => r.isQuestion).length)})`,
      withCode: answered.filter((r) => r.hasCode).length,
      onTarget: `${answered.filter((r) => r.onTarget.length).length} (${pct(answered.filter((r) => r.onTarget.length).length)})`,
      leaks: `${answered.filter((r) => r.leaks.length).length} (${pct(answered.filter((r) => r.leaks.length).length)})`,
    }
  })
  console.log('\nSummary (percentages are of the hints the AI actually gave):')
  console.table(summary)

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const name = `${stamp}${MOCK ? '-mock' : ''}`
  const md = [
    `# Hint evaluation ${name}`, '',
    `Models: ${config.models.join(', ')}. Levels: ${LEVELS.join(', ')}. ${CASES.length} cases (eval/hintCases.js).`,
    'Scored by keywords (crude: may miss a paraphrased leak or flag an innocent word); every hint is listed below.', '',
    '| Level | Cases | AI answered | Questions | With code | On target | Leaks the fix |', '|---|---|---|---|---|---|---|',
    ...summary.map((s) => `| ${s.level} | ${s.cases} | ${s.aiAnswered} | ${s.questions} | ${s.withCode} | ${s.onTarget} | ${s.leaks} |`), '',
    '| Case | Level | Hint | On target | Leak |', '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.case} | ${r.level} | ${r.hint ? r.hint.replace(/\|/g, '\\|').replace(/\n/g, ' ') : `_(no AI hint: ${r.reason})_`} | ${r.onTarget?.join(', ') || ''} | ${r.leaks?.join(', ') || ''} |`),
  ].join('\n')
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, 'results', `hints-${name}.json`), JSON.stringify({ models: config.models, levels: LEVELS, summary, rows }, null, 2))
  fs.writeFileSync(path.join(__dirname, 'results', `hints-${name}.md`), md)
  console.log(`Saved eval/results/hints-${name}.{json,md}`)
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
