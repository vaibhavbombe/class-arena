const { test, expect } = require('@playwright/test')
const { call, setupClass, login } = require('./helpers')

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
