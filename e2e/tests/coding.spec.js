const { test, expect, call, setupClass, login } = require('./helpers')

// Monaco is loaded from a CDN, so this test needs internet access.
test('coding practice: a student runs the samples in the browser, then submits and the judge accepts it', async ({ page }) => {
  const { admin, cls, students } = await setupClass()
  const T = admin.accessToken
  const question = await call('POST', '/api/questions', {
    type: 'code', prompt: 'Add two numbers\nReturn a + b.',
    code: { functionName: 'add', starterCode: 'function add(a, b) {\n}\n', sampleTests: [{ input: [2, 3], expected: 5 }], hiddenTests: [{ input: [-1, 1], expected: 0 }, { input: [100, 23], expected: 123 }] },
  }, T)
  const problem = await call('POST', '/api/problems', { classId: cls.id, questionId: question._id }, T)

  await login(page, students[0].email)
  await page.goto(`/problems/${problem.id}`)
  // Set the code through Monaco's own model (typing would fight its auto-closing brackets).
  await page.waitForFunction(() => window.monaco?.editor?.getModels().length > 0, null, { timeout: 30_000 })
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('function add(a, b) {\n  return a + b\n}\n'))

  await page.getByRole('button', { name: /Run samples/ }).click()
  await expect(page.getByText('Run: 1 of 1 tests passed')).toBeVisible()

  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByText('Submission: 3 of 3 tests passed')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Accepted/).first()).toBeVisible()
})

// "Run" executes code in a Web Worker on this site. A teacher can run a student's code, so that
// worker must not be able to reach the API with the teacher's cookie: its own CSP has
// connect-src 'none' (client/vercel.json), so any request from inside it is refused.
test('code run in the browser cannot make network requests (no way to steal a session)', async ({ page }) => {
  const { admin, cls, students } = await setupClass()
  const T = admin.accessToken
  const question = await call('POST', '/api/questions', {
    type: 'code', prompt: 'Add two numbers\nReturn a + b.',
    code: { functionName: 'add', sampleTests: [{ input: [2, 3], expected: 5 }], hiddenTests: [{ input: [1, 1], expected: 2 }] },
  }, T)
  const problem = await call('POST', '/api/problems', { classId: cls.id, questionId: question._id }, T)

  await login(page, students[0].email)
  await page.goto(`/problems/${problem.id}`)
  await page.waitForFunction(() => window.monaco?.editor?.getModels().length > 0, null, { timeout: 30_000 })
  // Tries a synchronous request to the refresh endpoint and logs what happened, then answers
  // wrongly on purpose so the sample's console output is shown.
  const attack = [
    'function add(a, b) {',
    "  let outcome = 'request went through'",
    "  try { const x = new XMLHttpRequest(); x.open('POST', '/api/auth/refresh', false); x.send(); outcome = 'request went through: ' + x.status }",
    "  catch (e) { outcome = 'request blocked' }",
    '  console.log(outcome)',
    '  return 0',
    '}',
  ].join('\n')
  await page.evaluate((code) => window.monaco.editor.getModels()[0].setValue(code), attack)
  await page.getByRole('button', { name: /Run samples/ }).click()
  // Exact matches: the code in the editor contains the same words inside quotes.
  await expect(page.getByText('Run: 0 of 1 tests passed')).toBeVisible()
  await expect(page.getByText('request blocked', { exact: true })).toBeVisible()
  await expect(page.getByText(/^request went through/)).toHaveCount(0)
})
