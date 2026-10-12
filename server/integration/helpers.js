// Shared helpers for the integration suites (run them with `npm run test:integration`).
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const mongoose = require('mongoose')

const BASE = process.env.API_URL || 'http://localhost:5002'
// Unique per run, so suites never collide with earlier data.
const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const PW = 'Passw0rd!x'
let failures = 0

// The refresh-token cookie from a response, as the browser would store it ({ value, attributes }).
function refreshCookie(res) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('ca_rt='))
  if (!raw) return null
  const [pair, ...attributes] = raw.split(';').map((part) => part.trim())
  return { value: decodeURIComponent(pair.slice('ca_rt='.length)), attributes }
}

// Returns the response both as { s, d } and { status, data }, plus `refresh`: the refresh
// token from the Set-Cookie header (null if none). `cookie` sends a refresh token as a cookie.
async function call(method, urlPath, body, token, { cookie } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: `ca_rt=${encodeURIComponent(cookie)}` }),
    },
    body: body && JSON.stringify(body),
  })
  const data = await res.json()
  const set = refreshCookie(res)
  return { s: res.status, d: data, status: res.status, data, refresh: set?.value || null, cookie: set }
}

function check(label, ok, detail) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + JSON.stringify(detail).slice(0, 400)}`)
}

// Invites someone into the admin's institute and accepts the invite. Returns the auth response.
async function invite(adminToken, prefix, role = 'teacher') {
  const inv = await call('POST', '/api/invites', { email: `${prefix}${run}@example.com`, role }, adminToken)
  const token = new URL(inv.d.inviteUrl).searchParams.get('token')
  const accepted = await call('POST', '/api/invites/accept', { token, name: prefix, password: PW })
  return { ...accepted.d, refreshToken: accepted.refresh } // the cookie's token, for suites that test refresh
}

// Some suites read or adjust the database directly (e.g. move a deadline into the past).
// Refuses anything that isn't clearly a development or test database.
async function connectTestDb() {
  await mongoose.connect(process.env.MONGODB_URI)
  const name = mongoose.connection.db.databaseName
  if (!/-(dev|test)$/.test(name)) {
    await mongoose.disconnect()
    throw new Error(`Refusing to run against database "${name}": its name must end in -dev or -test`)
  }
}

async function finish() {
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  if (mongoose.connection.readyState) await mongoose.disconnect()
  process.exitCode = failures ? 1 : 0
}

module.exports = { BASE, run, PW, call, check, invite, connectTestDb, finish }
