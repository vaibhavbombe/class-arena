// AI question generator against the fake AI server: drafts only (nothing saved), the same
// validation as hand-written questions, retry, clean failure, judge-checked coding drafts, limits.
const { getRedis } = require('../lib/redis')
const Question = require('../models/Question')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const aiRequests = async () => (await fetch(`${process.env.AI_MOCK_URL}/requests`)).json()

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Generator', name: 'Admin', email: `gn-a${run}@example.com`, password: PW })).d
  const [T1, T2, T3, T4, T5] = [await invite(A.accessToken, 'gn-t1-'), await invite(A.accessToken, 'gn-t2-'), await invite(A.accessToken, 'gn-t3-'), await invite(A.accessToken, 'gn-t4-'), await invite(A.accessToken, 'gn-t5-')]
  const cls = (await call('POST', '/api/classes', { name: 'Gen' }, T1.accessToken)).d
  const S = (await call('POST', '/api/auth/student-signup', { name: 'Stu', email: `gn-s${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const generate = (T, body) => call('POST', '/api/questions/generate', body, T.accessToken)

  check('students cannot generate questions', (await generate(S, { topic: 'loops', type: 'mcq' })).s === 403, null)
  check('bad requests are rejected before any AI call', (await generate(T1, { topic: 'loops', type: 'code', count: 5 })).s === 400, null)

  const before = await Question.countDocuments({ institutionId: A.user.institutionId })
  const mcq = await generate(T1, { topic: 'JavaScript variable scope', type: 'mcq', count: 3, difficulty: 'easy', notes: 'for beginners' })
  check('3 MCQ drafts come back, in the bank\'s own format', mcq.s === 200 && mcq.d.drafts.length === 3 && mcq.d.drafts.every((d) => d.type === 'mcq' && d.difficulty === 'easy' && d.options.filter((o) => o.correct).length === 1), mcq.d)
  check('drafts are not saved until the teacher saves them', (await Question.countDocuments({ institutionId: A.user.institutionId })) === before, null)
  const sent = (await aiRequests()).at(-1).messages.map((m) => m.content).join('\n')
  check('the AI gets the topic, notes, type, count and difficulty', /JavaScript variable scope/.test(sent) && /for beginners/.test(sent) && /exactly 3 easy question\(s\) of type "mcq"/.test(sent), sent)
  check('generating again within 15 s is refused', (await generate(T1, { topic: 'loops', type: 'mcq' })).s === 429, null)

  const saved = await call('POST', '/api/questions', mcq.d.drafts[0], T1.accessToken)
  check('a draft can be saved through the normal question API', saved.s === 201 && saved.d.options.length === 3, saved.d)

  const requestsBefore = (await aiRequests()).length
  const flaky = await generate(T2, { topic: 'MOCK_FLAKY arrays', type: 'short', count: 2 })
  check('a garbage reply is retried; short-answer drafts come back', flaky.s === 200 && flaky.d.drafts.length === 2 && flaky.d.drafts[0].acceptedAnswers.includes('4') && (await aiRequests()).length - requestsBefore === 2, flaky.d)

  const bad = await generate(T3, { topic: 'MOCK_BAD trivia', type: 'mcq', count: 2 })
  check('output that breaks the bank\'s rules (two right MCQ answers) is never returned', bad.s === 502 && /could not write valid questions/.test(bad.d.error), bad.d)

  const code = await generate(T4, { topic: 'doubling numbers', type: 'code', count: 1 })
  const draft = code.d.drafts?.[0]
  check('coding drafts include tests and a reference solution', code.s === 200 && draft.code.functionName === 'double' && draft.code.hiddenTests.length === 3, code.d)
  check('the AI\'s reference solution is checked in the judge: 4/4 Accepted', draft?.check?.verdict === 'Accepted' && draft.check.passed === 4 && draft.check.total === 4, draft?.check)
  const wrong = await generate(T5, { topic: 'MOCK_WRONGREF doubling', type: 'code', count: 1 })
  check('a wrong reference solution is flagged for the teacher (3/4, Wrong Answer)', wrong.d.drafts?.[0].check.verdict === 'Wrong Answer' && wrong.d.drafts[0].check.passed === 3, wrong.d.drafts?.[0]?.check)

  const day = new Date().toISOString().slice(0, 10)
  await getRedis().set(`ai:day:${day}:generate:user:${T2.user.id}`, '20', 'EX', 60)
  await getRedis().del(`rate:generate:${T2.user.id}`)
  const capped = await generate(T2, { topic: 'loops', type: 'mcq', count: 1 })
  check('the daily generation limit per teacher is enforced', capped.s === 429 && /limit/.test(capped.d.error), capped.d)

  getRedis().disconnect()
  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
