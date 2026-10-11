// Creates a demo institute through the public API, so everything passes the normal validation:
// a teacher, 8 students, a question bank, two taken tests (for analytics), coding practice with
// submissions, and a contest with a leaderboard.
//
//   node scripts/seed-demo.js --api=http://localhost:5002 --password=<demo password>
//
// Needs the API (and its judge) running. Refuses non-local APIs unless --production is given.
// Accounts: demo-admin@example.com, demo-teacher@example.com, demo-student1..8@example.com.
// The admin account can invite people (which sends email), so only share the teacher and
// student logins publicly.
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const API = (arg('api') || 'http://localhost:5002').replace(/\/$/, '')
const PASSWORD = arg('password') || process.env.DEMO_PASSWORD
// --tag=x makes the emails demo-teacher+x@example.com etc., so the script can run again.
const TAG = arg('tag')
const email = (local) => (TAG ? `${local}+${TAG}@example.com` : `${local}@example.com`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function call(method, path, body, token) {
  const response = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${data?.error || ''}`)
  return data
}

const STUDENTS = ['Aisha Khan', 'Ben Carter', 'Chen Wei', 'Diya Sharma', 'Ethan Brooks', 'Fatima Noor', 'Gabriel Silva', 'Hana Sato']
// How well each student does (0..1), so the analytics have a spread.
const SKILL = [0.95, 0.8, 0.9, 0.55, 0.35, 0.85, 0.6, 0.25]

const MCQS = [
  ['Which keyword declares a block-scoped variable that can be reassigned?', ['let', 'var', 'const', 'function'], 'scope'],
  ['What does `[1, 2, 3].map((n) => n * 2)` return?', ['[2, 4, 6]', '[1, 2, 3]', '12', 'undefined'], 'arrays'],
  ['What is `typeof null` in JavaScript?', ['"object"', '"null"', '"undefined"', '"number"'], 'types'],
  ['Which method removes the last element of an array?', ['pop()', 'shift()', 'slice()', 'splice(0, 1)'], 'arrays'],
  ['What does `===` compare?', ['Value and type', 'Only value', 'Only type', 'Memory address only'], 'types'],
  ['Which loop always runs its body at least once?', ['do...while', 'while', 'for', 'for...of'], 'loops'],
]
const CODING = [
  { prompt: 'Sum of an array\nReturn the sum of all numbers in nums (0 for an empty array).', functionName: 'sum', solution: 'function sum(nums) { let s = 0; for (const n of nums) s += n; return s }', wrong: 'function sum(nums) { return nums.reduce((a, b) => a + b) }', samples: [[[[1, 2, 3]], 6]], hidden: [[[[]], 0], [[[-5, 5, 10]], 10], [[[100]], 100]] },
  { prompt: 'Count vowels\nReturn how many vowels (a, e, i, o, u, any case) are in the string s.', functionName: 'countVowels', solution: 'function countVowels(s) { return (s.match(/[aeiou]/gi) || []).length }', wrong: 'function countVowels(s) { return (s.match(/[aeiou]/g) || []).length }', samples: [[['hello'], 2]], hidden: [[[''], 0], [['AEIOU'], 5], [['rhythm'], 0]] },
  { prompt: 'Largest number\nReturn the largest number in nums (nums is never empty).', functionName: 'largest', solution: 'function largest(nums) { return Math.max(...nums) }', wrong: 'function largest(nums) { return Math.max(0, ...nums) }', samples: [[[[3, 9, 2]], 9]], hidden: [[[[-4, -2, -9]], -2], [[[7]], 7]] },
]
// Each pair is [list of arguments, expected result].
const tests = (pairs) => pairs.map(([input, expected]) => ({ input, expected }))

;(async () => {
  if (!PASSWORD) throw new Error('Pass --password=<demo password> (8+ chars with upper, lower, number and symbol)')
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)
  if (!local && !process.argv.includes('--production')) throw new Error(`${API} is not local. Add --production if you really mean to seed it.`)

  console.log(`Seeding demo data into ${API} ...`)
  const admin = await call('POST', '/api/auth/signup', { institutionName: 'ClassArena Demo Academy', name: 'Demo Admin', email: email('demo-admin'), password: PASSWORD })
  const invite = await call('POST', '/api/invites', { email: email('demo-teacher'), role: 'teacher' }, admin.accessToken)
  const token = new URL(invite.inviteUrl).searchParams.get('token')
  const teacher = await call('POST', '/api/invites/accept', { token, name: 'Tara Teacher', password: PASSWORD })
  const T = teacher.accessToken
  const cls = await call('POST', '/api/classes', { name: 'JavaScript Foundations' }, T)
  const students = []
  for (const [i, name] of STUDENTS.entries()) {
    students.push(await call('POST', '/api/auth/student-signup', { name, email: email(`demo-student${i + 1}`), password: PASSWORD, joinCode: cls.joinCode }))
  }

  // Question bank: multiple choice, a short answer, and coding questions.
  const mcqs = []
  for (const [prompt, [right, ...wrong], tag] of MCQS) {
    mcqs.push(await call('POST', '/api/questions', { type: 'mcq', prompt, difficulty: 'easy', tags: [tag], explanation: `The answer is ${right}.`, options: [{ text: right, correct: true }, ...wrong.map((text) => ({ text }))] }, T))
  }
  const short = await call('POST', '/api/questions', { type: 'short', prompt: 'What does DOM stand for?', tags: ['browser'], acceptedAnswers: ['Document Object Model'] }, T)
  const coding = []
  for (const c of CODING) {
    const code = { functionName: c.functionName, referenceSolution: c.solution, sampleTests: tests(c.samples), hiddenTests: tests(c.hidden), timeLimitMs: 1000 }
    // The same "Check with judge" a teacher uses: stop if a reference solution fails its tests.
    const checked = await call('POST', '/api/questions/check-code', { code, solution: c.solution }, T)
    if (checked.verdict !== 'Accepted') throw new Error(`The reference solution for ${c.functionName} got ${checked.verdict}`)
    coding.push(await call('POST', '/api/questions', { type: 'code', prompt: c.prompt, tags: ['coding'], code }, T))
  }

  // Two tests, taken by every student (right answers according to their skill).
  for (const [title, items] of [['Quiz 1: Basics', mcqs.slice(0, 3)], ['Quiz 2: Arrays and loops', [...mcqs.slice(3), short]]]) {
    const test = await call('POST', '/api/tests', { classId: cls.id, title, durationMinutes: 20 }, T)
    await call('PUT', `/api/tests/${test.id}`, { items: items.map((q) => ({ questionId: q._id, points: 2 })) }, T)
    await call('POST', `/api/tests/${test.id}/publish`, undefined, T)
    for (const [i, s] of students.entries()) {
      const view = await call('POST', `/api/tests/${test.id}/attempt`, undefined, s.accessToken)
      const answers = view.questions.map((q) => {
        const right = Math.random() < SKILL[i]
        if (q.type === 'short') return { index: q.index, text: right ? 'Document Object Model' : 'Data Object Model' }
        const bank = items.find((b) => b.prompt === q.prompt)
        const correctText = bank.options.find((o) => o.correct).text
        const pick = q.options.find((o) => (right ? o.text === correctText : o.text !== correctText))
        return { index: q.index, selectedOptionIds: [pick.id] }
      })
      await call('POST', `/api/tests/${test.id}/attempt/submit`, { answers }, s.accessToken)
    }
    await call('POST', `/api/tests/${test.id}/release`, { released: true }, T)
  }

  // Coding practice with a few submissions (the 5 s per-student submit limit is respected).
  const problems = []
  for (const q of coding.slice(0, 2)) problems.push(await call('POST', '/api/problems', { classId: cls.id, questionId: q._id }, T))
  for (const [i, s] of students.slice(0, 5).entries()) {
    const c = CODING[i % 2]
    await call('POST', `/api/problems/${problems[i % 2].id}/submit`, { code: SKILL[i] > 0.5 ? c.solution : c.wrong }, s.accessToken)
  }

  // A contest with all three coding problems, started now and open for 10 hours.
  const contest = await call('POST', '/api/contests', { classId: cls.id, title: 'Friday Cup' }, T)
  await call('PUT', `/api/contests/${contest.id}`, { durationMinutes: 600, penaltyMinutes: 20, freezeMinutes: 60, problemIds: coding.map((q) => q._id) }, T)
  await call('POST', `/api/contests/${contest.id}/start`, undefined, T)
  await sleep(5100)
  // Round r: everyone tries problem r; stronger students solve more (all within the first
  // minutes, since the API can't backdate submissions).
  for (let round = 0; round < 3; round++) {
    for (const [i, s] of students.entries()) {
      const p = round
      const good = Math.random() < Math.min(1, SKILL[i] + 0.15)
      await call('POST', `/api/contests/${contest.id}/problems/${p}/submit`, { code: good ? CODING[p].solution : CODING[p].wrong }, s.accessToken).catch(() => {})
    }
    await sleep(5100)
  }

  console.log('Done.')
  console.log(`  Teacher:  ${email('demo-teacher')}`)
  console.log(`  Students: ${email('demo-student1')} ... ${email(`demo-student${STUDENTS.length}`)}`)
  console.log(`  Admin:    ${email('demo-admin')} (can send invite emails: keep this one private)`)
})().catch((err) => {
  console.error(`Seeding failed: ${err.message}`)
  process.exit(1)
})
