const { test, expect, call, PW, login } = require('./helpers')

// IAM in the browser: an admin creates a custom role with checkboxes, gives it to a teacher,
// and that teacher's screens change on their next page load (no new login needed).
test('admin creates a "Teaching Assistant" role and the teacher\'s screens follow it', async ({ browser }) => {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const adminEmail = `e2e-iam-a${id}@example.com`
  const teacherEmail = `e2e-iam-t${id}@example.com`
  const admin = await call('POST', '/api/auth/signup', { institutionName: `IAM ${id}`, name: 'Ada Admin', email: adminEmail, password: PW })
  const invite = await call('POST', '/api/invites', { email: teacherEmail, role: 'teacher' }, admin.accessToken)
  await call('POST', '/api/invites/accept', { token: new URL(invite.inviteUrl).searchParams.get('token'), name: 'Tom Teacher', password: PW })

  const adminPage = await (await browser.newContext()).newPage()
  const teacherPage = await (await browser.newContext()).newPage()

  // Before: a normal teacher can create classes and use the question bank.
  await login(teacherPage, teacherEmail)
  await expect(teacherPage.getByRole('button', { name: 'Create class' })).toBeVisible()
  await expect(teacherPage.getByRole('link', { name: 'Question bank' })).toBeVisible()

  // The admin builds the role with checkboxes and assigns it in the member list.
  await login(adminPage, adminEmail)
  await adminPage.getByRole('button', { name: '+ New role' }).click()
  await adminPage.getByLabel('Role name').fill('Teaching Assistant')
  await adminPage.getByLabel('See test results').check()
  await expect(adminPage.getByLabel(/Create roles and assign them/)).toBeDisabled() // admin-only power
  await adminPage.getByRole('button', { name: 'Save role' }).click()
  await expect(adminPage.getByText(/Saved "Teaching Assistant"/)).toBeVisible()
  await adminPage.getByLabel('Role for Tom Teacher').selectOption({ label: 'Teaching Assistant' })
  await expect(adminPage.getByText(/Tom Teacher is now: Teaching Assistant/)).toBeVisible()

  // After: the teacher's next page load reflects the role.
  await teacherPage.reload()
  await expect(teacherPage.getByText("You're signed in as Teaching Assistant.")).toBeVisible()
  await expect(teacherPage.getByRole('button', { name: 'Create class' })).toHaveCount(0)
  await expect(teacherPage.getByRole('link', { name: 'Question bank' })).toHaveCount(0)
})
