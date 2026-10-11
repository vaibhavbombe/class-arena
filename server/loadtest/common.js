// Shared helpers for the load tests: percentiles, HTTP calls, limited concurrency, sockets.
const { io } = require('socket.io-client')

const PW = 'Passw0rd!x'

function summarize(values) {
  if (!values.length) return { count: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
  const round = (n) => Math.round(n * 10) / 10
  return {
    count: sorted.length,
    min: round(sorted[0]),
    p50: round(at(50)),
    p90: round(at(90)),
    p95: round(at(95)),
    p99: round(at(99)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  }
}

function makeClient(base) {
  return async function call(method, path, body, token) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${data?.error || ''}`)
    return data
  }
}

// Runs `task(i)` for i in 0..count-1 with at most `limit` running at once.
async function pool(count, limit, task) {
  const results = new Array(count)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < count) {
      const i = nextIndex++
      results[i] = await task(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker))
  return results
}

function connect(base, token) {
  return new Promise((resolve, reject) => {
    const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

const emit = (socket, event, payload) => new Promise((resolve) => socket.timeout(15000).emit(event, payload, (err, reply) => resolve(err ? { error: 'timeout' } : reply)))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// An institute with an admin and a class of `count` students (signed up `concurrency` at a time).
async function setupClass(call, { label, count, concurrency = 8 }) {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const admin = await call('POST', '/api/auth/signup', { institutionName: `Load ${label}`, name: 'Load Admin', email: `load-${label}-a${run}@example.com`, password: PW })
  const cls = await call('POST', '/api/classes', { name: `Load ${label}` }, admin.accessToken)
  const students = await pool(count, concurrency, (i) => call('POST', '/api/auth/student-signup', { name: `Student ${i + 1}`, email: `load-${label}-s${i}-${run}@example.com`, password: PW, joinCode: cls.joinCode }))
  return { admin, cls, students }
}

module.exports = { PW, summarize, makeClient, pool, connect, emit, sleep, setupClass }
