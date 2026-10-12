// Setup through the API (fast, and not what these tests are about), a UI login helper, and a
// check that the browser reported no Content-Security-Policy violations.
const base = require('@playwright/test')
const { expect } = base

// Collects CSP violations the browser reports on this page (Chromium logs them as console errors).
function watchCsp(page) {
  const violations = []
  page.on('console', (message) => {
    const text = message.text()
    // The code-runner worker's own policy blocks all requests on purpose (connect-src 'none');
    // the page's policy never contains that, so these reports are expected, not regressions.
    if (text.includes("connect-src 'none'")) return
    if (message.type() === 'error' && /Content Security Policy|Refused to (load|execute|connect|apply|create)/i.test(text)) {
      violations.push(text.slice(0, 300))
    }
  })
  return violations
}

// Every test's default page is watched; a violation fails the test.
const test = base.test.extend({
  page: async ({ page }, use) => {
    const violations = watchCsp(page)
    await use(page)
    expect(violations, 'Content-Security-Policy violations').toEqual([])
  },
})

const PW = 'Passw0rd!x'
const run = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

async function call(method, path, body, token) {
  const response = await fetch(process.env.E2E_API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${data?.error || ''}`)
  return data
}

// An institute (its admin acts as the teacher) with one class and `students` students.
async function setupClass({ students = 1, className = 'E2E class' } = {}) {
  const id = run()
  const adminEmail = `e2e-admin-${id}@example.com`
  const admin = await call('POST', '/api/auth/signup', { institutionName: `E2E ${id}`, name: 'Ada Admin', email: adminEmail, password: PW })
  const cls = await call('POST', '/api/classes', { name: className }, admin.accessToken)
  const list = []
  for (let i = 0; i < students; i++) {
    const email = `e2e-student${i}-${id}@example.com`
    const student = await call('POST', '/api/auth/student-signup', { name: `Student ${i + 1}`, email, password: PW, joinCode: cls.joinCode })
    list.push({ ...student, email })
  }
  return { admin: { ...admin, email: adminEmail }, cls, students: list }
}

async function login(page, email) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(PW)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

module.exports = { test, expect, PW, call, setupClass, login, watchCsp }
