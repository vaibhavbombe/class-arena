const { test, expect, PW, call, setupClass, login } = require('./helpers')
// The test plays the authenticator app: same RFC 6238 code generator the server uses.
const totp = require('../../server/lib/totp')

test('2FA: turn it on from the Security page, then log in with a code (and a recovery code)', async ({ page }) => {
  const { admin } = await setupClass()
  await login(page, admin.email)

  await page.getByRole('link', { name: 'Security' }).click()
  await page.getByPlaceholder('Confirm your password').fill(PW)
  await page.getByRole('button', { name: 'Set up two-factor login' }).click()
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible() // a data: image, allowed by the CSP
  const secret = (await page.getByTestId('mfa-secret').textContent()).replace(/\s/g, '')

  await page.getByLabel('2. Enter the 6-digit code the app shows').fill(totp.generate(secret))
  await page.getByRole('button', { name: 'Turn on' }).click()
  const codeItems = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem')
  await expect(codeItems).toHaveCount(10)
  const codes = await codeItems.allTextContents()
  await page.getByRole('button', { name: "I've saved them" }).click()
  await expect(page.getByText(/On since/)).toBeVisible()
  await expect(page.getByText('10 of 10 recovery codes left.')).toBeVisible()

  // The password alone no longer logs in.
  await page.getByRole('button', { name: 'Log out' }).click()
  // Wait for the login page: the dashboard's invite box ("teacher@email.com") also matches "Email".
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await page.getByPlaceholder('Email', { exact: true }).fill(admin.email)
  await page.getByPlaceholder('Password').fill(PW)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel(/Open your authenticator app/).fill('000000')
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('alert')).toContainText("That code isn't right")

  // The next 30-second code (the one used to turn it on can't be used again).
  await page.getByLabel(/Open your authenticator app/).fill(totp.generate(secret, Date.now() + 30_000))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByTitle('Two-factor login is on')).toBeVisible() // the badge in the members list

  // A recovery code works too, and the Security page counts it as used.
  await page.getByRole('button', { name: 'Log out' }).click()
  // Wait for the login page: the dashboard's invite box ("teacher@email.com") also matches "Email".
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await page.getByPlaceholder('Email', { exact: true }).fill(admin.email)
  await page.getByPlaceholder('Password').fill(PW)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel(/Open your authenticator app/).fill(codes[0])
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.getByRole('link', { name: 'Security' }).click()
  await expect(page.getByText('9 of 10 recovery codes left.')).toBeVisible()
})

test('2FA policy: the admin requires it for staff; a teacher without it is kept on the Security page until set up', async ({ page }) => {
  const { admin } = await setupClass()
  // Admin 2FA and a teacher, through the API (not what this test is about).
  const { secret: adminSecret } = await call('POST', '/api/auth/mfa/setup', { password: PW }, admin.accessToken)
  await call('POST', '/api/auth/mfa/enable', { code: totp.generate(adminSecret) }, admin.accessToken)
  const teacherEmail = `e2e-teacher-${Date.now()}@example.com`
  const { inviteUrl } = await call('POST', '/api/invites', { email: teacherEmail, role: 'teacher' }, admin.accessToken)
  await call('POST', '/api/invites/accept', { token: new URL(inviteUrl).searchParams.get('token'), name: 'Tina Teacher', password: PW })

  async function logIn(email, code) {
    await page.goto('/login')
    await page.getByPlaceholder('Email', { exact: true }).fill(email)
    await page.getByPlaceholder('Password').fill(PW)
    await page.getByRole('button', { name: 'Log in' }).click()
    if (code) {
      await page.getByLabel(/Open your authenticator app/).fill(code)
      await page.getByRole('button', { name: 'Verify' }).click()
    }
  }

  await logIn(admin.email, totp.generate(adminSecret, Date.now() + 30_000))
  await expect(page).toHaveURL(/\/dashboard/)
  await page.getByRole('link', { name: 'Security' }).click()
  await page.getByLabel('Require two-factor login for staff (admins and teachers)').check()
  await expect(page.getByText('1 staff member(s) without two-factor login')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()

  // The teacher's password still works, but only the Security page does.
  await logIn(teacherEmail)
  await expect(page).toHaveURL(/\/security/)
  await expect(page.getByText('Your institute requires two-factor login for staff')).toBeVisible()
  await page.getByRole('link', { name: 'Classes' }).click()
  await expect(page).toHaveURL(/\/security/)

  await page.getByPlaceholder('Confirm your password').fill(PW)
  await page.getByRole('button', { name: 'Set up two-factor login' }).click()
  const secret = (await page.getByTestId('mfa-secret').textContent()).replace(/\s/g, '')
  await page.getByLabel('2. Enter the 6-digit code the app shows').fill(totp.generate(secret))
  await page.getByRole('button', { name: 'Turn on' }).click()
  await page.getByRole('button', { name: "I've saved them" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.getByRole('link', { name: 'Security' }).click()
  await expect(page.getByText('Required by your institute, so it stays on.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
})
