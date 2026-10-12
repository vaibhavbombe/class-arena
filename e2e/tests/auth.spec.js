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

test('pages that need a login send you to the login page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
