# ClassArena — project guide for Claude

## What this project is
A multi-tenant classroom and competition platform: institutes run timed tests,
live quiz battles (Kahoot-style) and live coding contests, with AI hints,
AI question generation and teacher analytics. It is the flagship project of
Vaibhav's portfolio, built to be shown to recruiters for Full Stack / GenAI /
MERN roles.

## Roles
- **admin**: owns an institute, adds teachers, manages classes, sees all analytics
- **teacher**: creates classes, question banks, tests, hosts live quizzes/contests
- **student**: joins classes by code, takes tests, joins live competitions, practises

The institute is the tenant. Every tenant-scoped query MUST filter on
`req.institutionId`, which comes from the verified JWT via the auth middleware,
never from the request body, query or URL.

## Stack
- Client: React 18 + Vite 5, React Router, axios (interceptors for token refresh),
  Socket.io client, Monaco editor
- Server: Node.js + Express, Mongoose (MongoDB Atlas), Socket.io, Redis
  (live room state, leaderboards via sorted sets, judge queue), bcrypt, jsonwebtoken
- AI: OpenRouter-compatible API, called from the server only (never expose keys to the client)
- Hosting: Vercel (client), Render (server)
- Local ports: server 5002, client 5178 (5001/5177 are used by saas-starter, 4001/5176 by collab-editor)

## Reuse from earlier projects (D:\VAIBHAV\)
- `saas-starter`: auth (access 15m + rotating refresh 30d), invites, requireAuth /
  requireRole middleware, catch-all error handler, axios refresh interceptor
- `collab-editor`: Socket.io / WebSocket room patterns
- async job processor: queue + worker pattern for the code judge

## Build phases (ship and deploy after each)
1. Accounts: institutes, admin/teacher/student roles, classes, join codes
2. Question bank (MCQ, multi-select, short answer, code) + timed tests + auto-grading
3. Live quiz battle: join code, server-authoritative timer and scoring,
   speed-based points, Redis leaderboard, live answer-distribution charts for the teacher
4. Coding: Monaco editor, "Run" on samples in a browser Web Worker with timeout,
   "Submit" judged server-side against hidden tests in a sandbox with time/memory limits
5. Live coding contest: contest leaderboard, penalties, optional freeze
6. AI: 3-level hints (never full solutions; off or point-costing in contests),
   teacher question generator (teacher reviews before publishing), post-submission feedback.
   AI output must be validated against a schema, with retry and fallback.
7. Teacher analytics dashboard, load test (simulated students), README

## Security rules (non-negotiable)
- Correct answers and hidden test cases are never sent to the student's browser.
- Scoring, timers and contest state are decided on the server only.
- Student code never runs in the main server process; use an isolated sandbox with limits.
- Never commit `.env` files; never print secrets in logs or responses.
- Don't send stack traces to clients; return generic errors and log details server-side.

## How to work with Vaibhav
- Work one small step at a time. After each step, say exactly how to test it
  (Postman request or browser steps) and what result to expect.
- Explain *why* briefly for any design decision; he will be asked about it in interviews.
- He works on Windows with PowerShell. Save `.gitignore` and other config files as UTF-8.
- Use feature branches and merge to `master`; Vercel and Render deploy from `master`.
- Ask before adding a new paid service or dependency with native builds.

## Honesty rules
- READMEs list real limitations. Never claim tests, metrics or features that don't exist.
- Numbers for the resume (load-test results, latency, AI hint quality) only after
  they've actually been measured, and the README says how they were measured.
