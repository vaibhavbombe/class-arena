// AI feedback on practice submissions, against the fake AI server: one review per submission,
// no code in feedback, fallback, ownership, limits, and nothing secret sent to the AI.
const { getRedis } = require('../lib/redis')
const CodeSubmission = require('../models/CodeSubmission')
const { run, PW, call, check, invite, connectTestDb, finish } = require('./helpers')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SECRETS = /\b(7171|7272|14342)\b|REFSECRET/
const aiRequests = async () => (await fetch(`${process.env.AI_MOCK_URL}/requests`)).json()

;(async () => {
  await connectTestDb()
  const A = (await call('POST', '/api/auth/signup', { institutionName: 'Feedback', name: 'Admin', email: `fb-a${run}@example.com`, password: PW })).d
  const T = await invite(A.accessToken, 'fb-t-')
  const cls = (await call('POST', '/api/classes', { name: 'JS' }, T.accessToken)).d
  const student = async (name) => (await call('POST', '/api/auth/student-signup', { name, email: `fb-${name.toLowerCase()}${run}@example.com`, password: PW, joinCode: cls.joinCode })).d
  const [ann, bob, cat, dev, eve, fay] = [await student('Ann'), await student('Bob'), await student('Cat'), await student('Dev'), await student('Eve'), await student('Fay')]

  async function problem(prompt) {
    const q = (await call('POST', '/api/questions', {
      type: 'code', prompt,
      code: { functionName: 'total', referenceSolution: 'function total(nums) { /* REFSECRET */ return nums.reduce((a, b) => a + b, 0) }', sampleTests: [{ input: [[1, 2]], expected: 3 }], hiddenTests: [{ input: [[7171]], expected: 7171 }, { input: [[]], expected: 0 }, { input: [[7272, 7070]], expected: 14342 }] },
    }, T.accessToken)).d
    return (await call('POST', '/api/problems', { classId: cls.id, questionId: q._id }, T.accessToken)).d
  }
  const plain = await problem('Total\nReturn the sum of nums.')
  const coder = await problem('Code-happy total MOCK_CODE\nReturn the sum of nums.')
  const down = await problem('Down total MOCK_DOWN\nReturn the sum of nums.')

  async function judged(S, p, code) {
    const queued = (await call('POST', `/api/problems/${p.id}/submit`, { code }, S.accessToken)).d
    for (let i = 0; i < 60; i++) {
      const got = (await call('GET', `/api/problems/${p.id}/submissions/${queued.id}`, null, S.accessToken)).d
      if (got.status === 'done') return got
      await sleep(250)
    }
    throw new Error('not judged')
  }
  const feedback = (S, p, submissionId) => call('POST', `/api/problems/${p.id}/submissions/${submissionId}/feedback`, null, S.accessToken)

  const annSub = await judged(ann, plain, 'function total(nums) { return nums.reduce((a, b) => a + b) } // ANN_CODE')
  const first = await feedback(ann, plain, annSub.id)
  check('feedback on a failed submission comes from the AI', first.s === 200 && first.d.source === 'ai' && /some tests fail/.test(first.d.summary) && first.d.improvements.length === 1, first.d)
  const prompt = (await aiRequests()).at(-1).messages.map((m) => m.content).join('\n')
  check('the AI gets the code (as data), the verdict and how many hidden tests failed', /<student_code>[\s\S]*ANN_CODE/.test(prompt) && /Result: Runtime Error, 3 of 4 tests passed/.test(prompt) && /hidden test\(s\) failed/.test(prompt), prompt)
  check('...but never hidden test values or the reference solution', !SECRETS.test(prompt), prompt)

  const countBefore = (await aiRequests()).length
  const again = await feedback(ann, plain, annSub.id)
  check('asking again returns the saved review without another AI call', again.s === 200 && again.d.createdAt === first.d.createdAt && (await aiRequests()).length === countBefore, again.d)
  const annView = (await call('GET', `/api/problems/${plain.id}/submissions/${annSub.id}`, null, ann.accessToken)).d
  const staffView = (await call('GET', `/api/problems/${plain.id}/submissions/${annSub.id}`, null, T.accessToken)).d
  check('the review is shown with the submission, to the student and the teacher', annView.feedback?.summary === first.d.summary && staffView.feedback?.summary === first.d.summary, staffView.feedback)

  check('teachers cannot request reviews', (await feedback(T, plain, annSub.id)).s === 403, null)
  check('students cannot request a review of someone else\'s submission', (await feedback(bob, plain, annSub.id)).s === 404, null)

  const bobSub = await judged(bob, plain, 'function total(nums) { let sum = 0; for (const n of nums) sum += n; return sum }')
  const praise = await feedback(bob, plain, bobSub.id)
  check('an accepted submission gets a review too', praise.s === 200 && /passes every test/.test(praise.d.summary), praise.d)

  const queued = await CodeSubmission.create({ institutionId: A.user.institutionId, classId: cls.id, problemId: plain.id, studentId: bob.user.id, code: 'x' })
  check('no review while the submission is still being judged', (await feedback(bob, plain, queued.id)).s === 409, null)

  const catSub = await judged(cat, coder, 'function total(nums) { return 0 }')
  const noCode = await feedback(cat, coder, catSub.id)
  check('feedback that contains code is replaced by fixed feedback', noCode.s === 200 && noCode.d.source === 'fallback' && /Wrong Answer/.test(noCode.d.summary) && ![noCode.d.summary, ...noCode.d.strengths, ...noCode.d.improvements].some((text) => /=>|[{};]/.test(text)), noCode.d)
  const devSub = await judged(dev, down, 'function total(nums) { while (true) {} }')
  const outage = await feedback(dev, down, devSub.id)
  check('if the AI is down the student gets fixed feedback for the verdict', outage.s === 200 && outage.d.source === 'fallback' && /too slow/.test(outage.d.improvements[0]), outage.d)

  const eveSub = await judged(eve, plain, 'function total(nums) { return nums.length }')
  const beforeRace = (await aiRequests()).length
  const [x, y] = await Promise.all([feedback(eve, plain, eveSub.id), feedback(eve, plain, eveSub.id)])
  check('a double click starts only one AI review', (await aiRequests()).length - beforeRace === 1 && [x.s, y.s].includes(200), [x.s, y.s])

  const faySub = await judged(fay, plain, 'function total(nums) { return 1 }')
  const day = new Date().toISOString().slice(0, 10)
  await getRedis().set(`ai:day:${day}:feedback:user:${fay.user.id}`, '20', 'EX', 60)
  const capped = await feedback(fay, plain, faySub.id)
  const after = await CodeSubmission.findById(faySub.id)
  check('the daily review limit is enforced, and the submission can be reviewed later', capped.s === 429 && after.feedback === null && after.feedbackClaimedAt === null, capped.d)

  getRedis().disconnect()
  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
