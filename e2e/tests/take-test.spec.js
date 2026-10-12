const { test, expect, call, setupClass, login } = require('./helpers')

test('a student starts a timed test, answers in the browser and submits; the server grades it', async ({ page }) => {
  const { admin, cls, students } = await setupClass()
  const T = admin.accessToken
  const q1 = await call('POST', '/api/questions', { type: 'mcq', prompt: 'Which planet is the largest?', options: [{ text: 'Jupiter', correct: true }, { text: 'Mars' }, { text: 'Venus' }] }, T)
  const q2 = await call('POST', '/api/questions', { type: 'short', prompt: 'What is the chemical symbol for water?', acceptedAnswers: ['H2O'] }, T)
  const testDoc = await call('POST', '/api/tests', { classId: cls.id, title: 'Science check', durationMinutes: 10 }, T)
  await call('PUT', `/api/tests/${testDoc.id}`, { items: [{ questionId: q1._id, points: 2 }, { questionId: q2._id, points: 3 }] }, T)
  await call('POST', `/api/tests/${testDoc.id}/publish`, undefined, T)

  page.on('dialog', (dialog) => dialog.accept()) // "Start the test?" and "Submit your answers?"
  await login(page, students[0].email)
  await page.goto(`/tests/${testDoc.id}`)
  await page.getByRole('button', { name: 'Start test' }).click()

  await page.getByText('Jupiter').click()
  await page.getByLabel(/Answer to question/).fill('h2o')
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByText(/Submitted/).first()).toBeVisible()

  // The grade is decided on the server: both right (short answers ignore case) = 5 of 5.
  const results = await call('GET', `/api/tests/${testDoc.id}/results/${students[0].user.id}`, undefined, T)
  expect(results.score).toBe(5)
  expect(results.maxScore).toBe(5)
})
