const { test, expect, call, setupClass, login, watchCsp } = require('./helpers')

// Two browsers at once: the teacher hosts on one screen, a student plays on another, and
// everything between them goes over Socket.io.
test('live quiz: a student joins with the PIN, answers, and both screens follow the game', async ({ browser }) => {
  const { admin, cls, students } = await setupClass()
  const T = admin.accessToken
  const q = await call('POST', '/api/questions', { type: 'mcq', prompt: 'What is 6 x 7?', options: [{ text: '42', correct: true }, { text: '36' }, { text: '48' }, { text: '54' }] }, T)
  const quiz = await call('POST', '/api/live-quizzes', { classId: cls.id, title: 'Times tables' }, T)
  await call('PUT', `/api/live-quizzes/${quiz.id}`, { items: [{ questionId: q._id, seconds: 20 }] }, T)
  const game = await call('POST', '/api/live-games', { quizId: quiz.id }, T)

  const hostContext = await browser.newContext()
  const playerContext = await browser.newContext()
  const host = await hostContext.newPage()
  const player = await playerContext.newPage()
  const violations = [host, player].map(watchCsp)

  await login(host, admin.email)
  await host.goto(`/live-games/${game.id}/host`)
  await expect(host.getByText(game.pin, { exact: true })).toBeVisible()

  await login(player, students[0].email)
  await player.goto('/play')
  await player.getByLabel('Game PIN').fill(game.pin)
  await player.getByRole('button', { name: 'Enter' }).click()
  await expect(player.getByText("You're in!")).toBeVisible()
  await expect(host.getByText('Student 1')).toBeVisible() // the host's lobby updates live

  await host.getByRole('button', { name: 'Start' }).click()
  await expect(player.getByText('What is 6 x 7?')).toBeVisible()
  await player.getByRole('button', { name: '42' }).click()

  // The only player answered, so the question closes early and both screens show the reveal.
  await expect(player.getByText('Correct')).toBeVisible()
  await host.getByRole('button', { name: /Show podium/ }).click()
  await expect(player.getByText('1st place')).toBeVisible()

  expect(violations.flat(), 'Content-Security-Policy violations').toEqual([])
  await hostContext.close()
  await playerContext.close()
})
