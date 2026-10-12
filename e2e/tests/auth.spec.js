const { test, expect } = require('@playwright/test')
const { setupClass, login } = require('./helpers')

test('login: a wrong password is refused, the right one opens the dashboard with the class', async ({ page }) => {
  const { cls, students } = await setupClass({ className: 'Physics 101' })

  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(students[0].email)
  await page.getByPlaceholder('Password').fill('Not-the-password1!')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Invalid email or password')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  await login(page, students[0].email)
  await expect(page.getByText(cls.name)).toBeVisible()
})

test('no tokens are readable by page scripts, and a reload keeps you logged in (refresh cookie)', async ({ page, context }) => {
  const { cls, students } = await setupClass({ className: 'Chemistry 201' })
  await login(page, students[0].email)

  const stored = await page.evaluate(() => ({ keys: Object.keys(localStorage), values: Object.values(localStorage).join(' '), cookie: document.cookie }))
  expect(stored.keys).not.toContain('refreshToken')
  expect(stored.keys).not.toContain('accessToken')
  expect(stored.values).not.toMatch(/eyJ/) // no JWT anywhere in localStorage
  expect(stored.cookie).not.toContain('ca_rt') // httpOnly: invisible to document.cookie
  const cookies = await context.cookies()
  const refresh = cookies.find((c) => c.name === 'ca_rt')
  expect(refresh?.httpOnly).toBe(true)
  expect(refresh?.sameSite).toBe('Strict')

  await page.reload()
  await expect(page.getByText(cls.name)).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  expect((await context.cookies()).find((c) => c.name === 'ca_rt')).toBeUndefined()
})

test('pages that need a login send you to the login page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
