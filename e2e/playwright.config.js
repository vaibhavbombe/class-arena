// Browser end-to-end tests. Playwright starts its own API and client on spare ports (never
// reusing a server that's already running), with email, AI and rate limits switched off and
// Redis keys under "e2e:". Locally the database comes from server/.env; in CI from the workflow.
const path = require('path')
const { defineConfig, devices } = require('@playwright/test')
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env'), quiet: true })

const API_PORT = 5094
const CLIENT_PORT = 5179
const API_URL = `http://localhost:${API_PORT}`
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`

// The tests create accounts and classes, so they only run against -dev or -test databases.
const db = (() => { try { return new URL(process.env.MONGODB_URI || '').pathname.slice(1) } catch { return '' } })()
if (!/-(dev|test)$/.test(db)) throw new Error(`Refusing to run: MONGODB_URI points at "${db || '?'}". Use a database whose name ends in -dev or -test.`)

process.env.E2E_API_URL = API_URL

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --no-node-snapshot server.js',
      cwd: path.join(__dirname, '..', 'server'),
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        CLIENT_URL,
        REDIS_PREFIX: 'e2e',
        EMAIL_DISABLED: 'true',
        AI_DISABLED: 'true',
        OPENROUTER_API_KEY: '',
        RATE_LIMITS_DISABLED: 'true',
      },
    },
    {
      command: `npx vite --port ${CLIENT_PORT} --strictPort`,
      cwd: path.join(__dirname, '..', 'client'),
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env, VITE_API_URL: API_URL },
    },
  ],
})
