# ClassArena: project deep-dive

A walk through the problem, the design, the technology choices (and what I didn't choose, and why),
the hard problems I hit, and the questions an interviewer is likely to ask, from basic to advanced.
Every number here was measured; where something is a limit or unfinished, it says so.
Shorter companions: the [README](../README.md) and [engineering notes](engineering-notes.md).

**Contents**
1. [Problem statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Architecture](#3-architecture)
4. [Technology choices, and the alternatives](#4-technology-choices-and-the-alternatives)
5. [How the main features work](#5-how-the-main-features-work)
6. [Challenges and how I solved them](#6-challenges-and-how-i-solved-them)
7. [Testing and quality](#7-testing-and-quality)
8. [Performance and scaling](#8-performance-and-scaling)
9. [Security](#9-security)
10. [Interview questions: basic to advanced](#10-interview-questions-basic-to-advanced)
11. [Limitations and what I'd do next](#11-limitations-and-what-id-do-next)
12. [Pitches: 30 seconds and 2 minutes](#12-pitches-30-seconds-and-2-minutes)

---

## 1. Problem statement

Coaching institutes and schools juggle several tools: one for tests, one for quizzes in class, another for
coding practice, and none of them talk to each other or give the teacher one view of how a student is doing.
Coding practice is the hardest part to build, because running student code safely is genuinely difficult.

**Goal:** one multi-tenant platform where an institute can run:
- **timed tests** with automatic grading,
- **live quiz battles** (Kahoot-style) in class,
- **coding practice and live coding contests** with a safe server-side judge,
- **AI help** (hints, feedback, question drafts) that helps without giving answers away,
- and **analytics** for the teacher across all of it.

**Constraints I chose deliberately:** run on free tiers (Vercel, Render, MongoDB Atlas, Upstash Redis,
free AI models), so the design has to cope with cold starts, one small server and remote databases; and treat
security as a requirement, not a later phase, because it handles grades and runs untrusted code.

## 2. Requirements

**Functional**
- Institutes are tenants; roles are admin, teacher and student; teachers are invited by email, students join a
  class with a 6-character code.
- Question bank: multiple choice, multi-select, short answer and JavaScript coding questions with hidden tests.
- Timed tests: autosave, a countdown, submit; grading on the server; results released by the teacher.
- Live quiz: join with a PIN, server-timed questions, speed-based points, live leaderboard and answer chart.
- Coding: run samples in the browser, submit to the server judge; contests with an ICPC leaderboard and freeze.
- AI: 3-level hints, a review of submitted code, question drafts the teacher must approve.
- Analytics per class: averages, trends, weakest topics, hardest questions, students needing attention.

**Non-functional (these drove most decisions)**
- **Tenant isolation:** one institute can never see another's data, even by guessing ids.
- **The server is the authority:** correct answers and hidden tests never reach the browser; timers, scores and
  contest state are decided on the server.
- **Untrusted code never runs in the API process**, and has hard CPU, memory and time limits.
- **Real time:** a class of up to a few hundred students in one live quiz without visible lag.
- **Resilience:** an AI or judge outage must degrade a feature, not break the page.
- **Cost:** $0 to run.

## 3. Architecture

```
 Browser (React SPA)
   │  static files + Vercel middleware for /api/auth/* (makes the refresh cookie first-party)
   ▼
 Vercel ───────────────► Render: Node.js API (Express 5 + Socket.io)
                           │        │          │              │
                           │        │          │              └─► OpenRouter (AI, server-side only)
                           │        │          └─► Judge worker process (isolated-vm), forked by a supervisor
                           │        └─► Redis (Upstash): live game state, leaderboards, judge queue + results,
                           │                              rate-limit counters, AI budgets
                           └─► MongoDB Atlas: institutes, users, classes, questions, tests, attempts,
                                               submissions, contests, hints (the permanent record)
```

**Why this shape**
- **One API process plus a separate judge process.** A modular monolith is the right size for one developer
  and one free server: one deploy, one log, transactions-like consistency through atomic database updates.
  The one thing that *must* be separate is running student code, so the judge is its own process with
  its own minimal environment.
- **MongoDB for the permanent record, Redis for fast shared state.** Live games need atomic counters, sorted
  leaderboards, expiry and pub/sub; keeping that in Redis (not in the API's memory) means it survives an API
  restart and is ready for more than one API instance.
- **The browser talks to the API directly**, except auth, which goes through the client's own domain so the
  refresh-token cookie is first-party (Safari blocks third-party cookies).

**Main request flows**
- *Answer in a live quiz:* socket event → server validates against the game state in Redis → one atomic Lua
  script records the answer and score → acknowledgement → when everyone has answered, the server closes the
  question and broadcasts the reveal.
- *Code submission:* POST → stored as "queued" → job pushed to a Redis list → `202 Accepted` → the judge worker
  runs it in a fresh isolate → publishes the result → the API stores a student-safe summary → the page sees it.
- *AI hint:* POST → limits checked → prompt built from the problem, samples and the student's code (never hidden
  tests) → model reply validated (schema, no code, level-1 must be a question) → retried or replaced by a
  standard hint → saved once.

## 4. Technology choices, and the alternatives

| Area | Chosen | Alternatives considered | Why this one |
|---|---|---|---|
| Frontend | **React 18 + Vite** | Next.js, Angular | A single-page app is all this needs (no SEO, everything behind login). Vite is fast to build; Next.js would add server rendering I'd not use. |
| Routing / HTTP | **React Router, axios** | fetch, React Query | axios interceptors made the silent token refresh simple. React Query would help caching; not needed at this size. |
| Backend | **Node.js + Express 5** | NestJS, Fastify, Django, Spring | One language across the stack, a huge ecosystem, and Socket.io runs on the same HTTP server. Express 5 forwards async errors to the error handler. NestJS adds structure I didn't need; Fastify is faster but Express was fast enough (measured). |
| Database | **MongoDB (Atlas) + Mongoose** | PostgreSQL, MySQL | Questions vary a lot by type (options, accepted answers, code with test cases), and tests keep a *snapshot* of each question; documents fit that naturally. Trade-off: no foreign keys or multi-document transactions used, so deletes are ordered to be safely retryable. For heavy reporting I'd consider Postgres. |
| Fast shared state | **Redis (Upstash)** | API memory, MongoDB | Atomic Lua scripts, sorted sets for leaderboards, TTLs, lists for the judge queue, pub/sub for results, and counters for rate limits, all shared across instances and restarts. |
| Real time | **Socket.io** | raw WebSocket, Server-Sent Events, polling | Rooms (per game, per host, per player), acknowledgements for answers, automatic reconnection and a polling fallback. SSE is one-way; raw WebSockets would mean rebuilding rooms and acks. |
| Auth | **JWT access token (15 min) + rotating refresh token (30 days, httpOnly cookie)** | server sessions, long-lived JWT | Stateless checks on every request and on socket connect, while refresh tokens can be revoked (rotation + server-side record). Long-lived JWTs can't be revoked. |
| Code judge | **isolated-vm in a separate process** | `vm`/vm2, Docker per submission, Judge0 | Node's `vm` isn't a security boundary and vm2 was abandoned after sandbox escapes. Docker per run is stronger but needs a host that allows it (free Render doesn't) and is slow to start. Judge0 is great but another service to host. isolated-vm gives a real V8 isolate with memory and CPU limits; running it in a separate, secret-free process limits the damage of any escape. |
| Code editor | **Monaco** (from CDN, lazy-loaded) | CodeMirror, textarea | The VS Code editor students already know; loaded only on coding pages so other pages stay light. |
| AI | **OpenRouter** (free models, fallback list) | OpenAI/Anthropic directly | One API for many models, free models for a $0 demo, and a `models` fallback list when one is rate-limited. Swapping to a paid model is one setting. |
| Email | **Brevo HTTP API** (Gmail SMTP locally) | SMTP everywhere | Render's free tier blocks SMTP ports, so production uses an HTTP email API. |
| Hosting | **Vercel (client), Render (API)** | AWS/GCP, one VPS | Free, deploy-on-push from `master`, HTTPS included. Trade-off: cold starts and one small instance. |
| Tests | **node:test, a custom integration runner, Playwright** | Jest, Cypress | node:test needs no dependencies; integration tests hit a real API and database; Playwright drives real browsers, including two at once for live games. |

## 5. How the main features work

**Multi-tenancy.** The `institutionId` is signed into the access token. Every tenant-scoped query filters on
`req.institutionId` from the verified token, never from the body, query or URL. Objects from another institute
answer **404, not 403**, so ids can't be probed.

**Timed tests.**
- A test keeps a **snapshot** of each question, so editing the bank later never changes a test students took.
- Students get questions **without answers**; options can be shuffled per student.
- **Autosave** writes each answer with an atomic `$set`, only while the attempt is open and before the deadline
  (plus a 5-second grace for network delay).
- **Submit** uses **optimistic concurrency**: the update only succeeds if the attempt's `revision` hasn't
  changed, so an autosave racing a submit can't be lost or overwrite a graded attempt. Five simultaneous "Start"
  clicks create one attempt (unique index on test + student).
- **Coding questions in tests** are graded after submit by the judge, for partial credit (3 of 4 hidden tests
  passed = 3 of 4 points), applied with an atomic update pipeline so parallel results can't overwrite each other.

**Live quiz.**
- State lives in Redis; every state change (lobby → question → reveal → ended) is a **compare-and-set Lua
  script**, so two "Next" clicks can't skip a question.
- The server sets each question's deadline; answers are recorded by one atomic Lua script (rejects duplicates,
  late answers and non-players) with 1 second of grace for network delay.
- Points: **1000 for an instant correct answer, falling to 500 at the buzzer**, 0 if wrong.
- Correctness stays hidden until the reveal; the teacher's chart is sent in batches (see challenge 1).
- After a server restart, an overdue question is closed the next time anyone looks at the game.

**Judge.**
- Each submission runs in a **fresh V8 isolate** with a memory cap, a CPU time limit per test and a fresh context
  per test; no Node APIs (no require, files, network, process or timers); output and logs capped.
- The worker process's environment holds **only the Redis URL**; a supervisor restarts it, and a 30-second
  watchdog kills a hung job.
- Verdicts: Accepted, Wrong Answer, Runtime Error, Time Limit Exceeded, Memory Limit Exceeded, Compile Error,
  Output Too Large. Hidden tests reach students only as pass/fail.
- Submissions are queued and answered with `202`; a job still unanswered after 3 minutes becomes "Judge Error",
  so nothing waits forever. One submission per 5 seconds per student.

**Contests.** ICPC ranking as a pure, unit-tested function: problems solved, then penalty (minutes to each first
accepted submission + 20 per earlier wrong try on solved problems; compile errors free). During the **freeze**
students see the board as it was while the teacher sees it live; the server only sends an "updated" ping and
each screen fetches **its own** board, so frozen results never reach a student's browser.

**AI.** Treated as untrusted input: JSON schema validation, generated questions must pass the same validator as
hand-written ones, no code in hints or reviews, one retry, then a standard fallback. Hidden tests and reference
solutions are never sent to the model; student code is passed as delimited data with an instruction to ignore
instructions inside it. Daily budgets per student, teacher and institute; each hint level and each review is
stored once (unique index / atomic claim), so double clicks never pay twice.

**Analytics.** A pure function over tests, submitted attempts and the current roster: class average, participation,
trend by test, topic mastery by tag (weakest first), hardest questions, and a "needs attention" flag.

## 6. Challenges and how I solved them

Each is *problem → how I found it → fix → proof*. Details in [engineering-notes.md](engineering-notes.md).

1. **Live quiz slowed down quadratically with class size.** My load test (200 simulated students) showed the
   slowest answers taking **1.9 s**. Profiling the answer path: each answer re-read every answer and player from
   Redis to update the teacher's chart, O(n²) per question. I made the count a single `HLEN` and batched the
   chart to every 250 ms. **p99 fell to 245 ms and stayed flat from 50 to 200 players.** I then measured the
   remaining time: 3 sequential Redis calls at a measured ~69 ms each, so I know exactly what's left.

2. **The last student to answer never saw their result.** Only a two-browser Playwright test caught it: the
   server broadcast the reveal before acknowledging the last answer, and the late acknowledgement reset that
   student's screen. Fixed on both sides (reply first; the client never moves back from the reveal).
   **Failed 4/4 before, passes 4/4 after; runs in CI.**

3. **Rate limits were keyed on a proxy's IP.** I measured the deployed service instead of trusting defaults:
   Render adds 3 `X-Forwarded-For` hops, Vercel's proxy makes it 4. Trusting "4 when it looks like Vercel" would
   be spoofable, so the Vercel middleware sends the client IP with a **shared secret** that the API checks in
   constant time. **Verified live**, including that a guessed secret is ignored.

4. **Running a student's code could have stolen a teacher's session.** While designing the Content-Security-
   Policy I noticed teachers can run students' code in a browser worker on the site's origin, which could call
   the refresh endpoint with the teacher's cookie. I gave the worker its own policy: it may evaluate code but
   has `connect-src 'none'`. **A browser test plants that attack; it's blocked, and the same test fails if the
   protection is removed** (I checked the negative case on purpose).

5. **Secure cookies across two domains.** Moving the refresh token to an httpOnly cookie would break Safari
   (third-party cookies), so auth goes through the client's own domain via a Vercel middleware. Also handled:
   concurrent refreshes in one tab, two tabs rotating the same cookie, and migrating existing sessions.
   **Verified on the live site.**

6. **AI that helps without cheating.** I built an evaluation: 20 beginner bugs, each hint read by a human. Level
   1 gave the fix away **0/20** once the server rejected non-questions. Level 2 ("the approach") gave it away
   **17/19** despite the instructions, so I reordered the levels to question → *where* the problem is → the
   change; a partial re-run gave **0/8** (8/8 before). The keyword auto-score caught only 5 of the 17 leaks,
   which taught me that automatic metrics need a human check.

7. **Free AI models get rate-limited.** In production the free model answered 429. I added a fallback list of
   models and an "last AI error" field in the health check, so the cause was visible without server logs; the
   app kept working on standard hints meanwhile.

## 7. Testing and quality

- **Unit tests (120):** pure logic: grading, attempt rules, ranking, analytics, AI validation, the judge
  (every verdict, escape attempts, limits that can't be raised).
- **Integration tests (23 suites):** a real API and database over HTTP and Socket.io: tenant isolation, roles,
  races (simultaneous starts, autosave vs submit, simultaneous answers), the judge, contests, AI against a
  **fake AI server** (no cost, deterministic failures), rate limits on a second API with limits switched on.
- **Browser tests (7, Playwright):** run against the **production build with the production headers**, so the
  CSP is tested too; any CSP violation fails a test.
- **CI (GitHub Actions):** all three layers on every push, with MongoDB and Redis as throwaway containers and no
  secrets. Failing unit tests appear as public annotations.
- **Load test** and **hint evaluation** are separate scripts that measure rather than pass/fail.

## 8. Performance and scaling

**Measured** (laptop, API local, Atlas and Upstash remote; not the free-tier host):

| Scenario | Result |
|---|---|
| Live quiz, 50 / 100 / 200 players | answer acknowledged p50 ~215 ms, p99 245 ms at 200; 0 errors |
| Same, before the batching fix (200) | p99 1,936 ms |
| 50 simultaneous contest submissions (20% infinite loops) | all correct, 31.8 s, ~1.6 per second |

**How I'd scale it, in order of payoff**
1. Put Redis in the same region as the API (the 3 × 69 ms round trips are most of the answer latency).
2. More judge workers (throughput grows roughly with cores); later a separate judge host with a kernel sandbox.
3. Several API instances behind a load balancer with the **Socket.io Redis adapter** and a shared timer, which
   the Redis-based game state already allows.
4. Cache or incrementally update contest boards instead of recomputing them per request.

## 9. Security

- Tenant from the signed token only; 404 for other tenants' ids.
- Answers and hidden tests never sent to students; scoring and timers on the server.
- Student code: isolated-vm in a separate, secret-free process; in the browser, a worker with no network.
- Auth: bcrypt; 15-minute access token in memory; rotating refresh token in an httpOnly, Secure,
  SameSite=Strict cookie; reset tokens stored as SHA-256 hashes, single-use, 30-minute expiry.
- Rate limits that count *failures* per target (wrong passwords, class codes, PINs), generous per-IP limits
  because a school shares one IP; unknown emails treated exactly like real ones.
- Content-Security-Policy (scripts only from the site and the pinned editor version on the CDN), security headers
  on the API, no stack traces to clients, secrets only in environment variables.

## 10. Interview questions: basic to advanced

### Basic

**Q: What is ClassArena in one line?**
A multi-tenant platform where institutes run timed tests, Kahoot-style live quizzes and coding contests with a
safe code judge and AI help, with analytics for teachers.

**Q: Why the MERN-style stack?**
One language across client and server, Socket.io on the same server for real time, and MongoDB fits questions
whose shape varies by type. I picked each piece for a reason (section 4), not as a bundle.

**Q: How does login work?**
Email and password checked with bcrypt; the server returns a 15-minute JWT (kept in memory) and sets a 30-day
refresh token as an httpOnly cookie. When the JWT expires, an axios interceptor calls refresh, which rotates the
refresh token (each one works once) and returns a new JWT.

**Q: How do roles work?**
The role is in the signed token; middleware checks it per route (`requireRole`), and the user is re-read on each
request so a role change applies immediately.

**Q: How do students join?**
With a 6-character class code (ambiguous characters removed); wrong codes are rate-limited per student and per IP.

### Intermediate

**Q: How do you stop students seeing correct answers?**
They're never sent. The student view of a test is built by a function that strips answers, unit-tested to make
sure nothing sent to a student contains them. Grading happens on the server after submit.

**Q: How does the timer work if a student changes their computer clock?**
The server stores the deadline and checks it on every save and on submit; the browser only displays a
countdown corrected by the server's time. Late saves are refused (with 5 seconds of grace for the network).

**Q: Two requests (autosave and submit) arrive together. What happens?**
Autosave only writes while the attempt is "in progress" and before the deadline; submit uses an optimistic
concurrency check on a revision number. Whichever loses is told so; nothing is silently overwritten. There's an
integration test for exactly this race.

**Q: Why Redis for the live game instead of keeping it in memory?**
Atomic Lua scripts make state changes and answer recording race-free; leaderboards are sorted sets; keys expire;
and the state survives an API restart and can be shared by several instances.

**Q: How is the speed-based score calculated?**
1000 points for an instant correct answer, falling linearly to 500 at the buzzer, 0 if wrong; the time is
measured on the server from when the question opened.

**Q: What happens if the server restarts during a live question?**
The game state is in Redis, not memory. When anyone next looks at the game, an overdue question is closed and
revealed, so the game continues.

### Advanced

**Q: How do you run untrusted code safely?**
In a V8 isolate (isolated-vm) inside a separate worker process. The isolate has no Node APIs, a memory cap and a
CPU limit per test; each test gets a fresh context; output is capped. The process's environment holds only the
Redis URL, so even an escape finds no database password or JWT secret. A watchdog kills hung jobs and a
supervisor restarts the worker. I'm honest that a V8 isolate is weaker than a kernel sandbox; for real scale I'd
move the judge to its own host with seccomp/namespaces (like Judge0).

**Q: Why not vm2 or Node's vm module?**
`vm` isn't a security boundary at all, and vm2 was deprecated after repeated sandbox escapes.

**Q: Why is judging asynchronous?**
Judging can take seconds and must not hold an HTTP request open. Submissions are queued in Redis and acknowledged
with 202; the worker publishes results; a listener stores them. Results missed during a restart are picked up
later, and stuck jobs become "Judge Error" after 3 minutes.

**Q: How do you keep the contest freeze from leaking?**
The board is computed per viewer on the server: students get the frozen version, teachers the live one. Sockets
only carry an "updated" signal, never the board, so the rule lives in one place.

**Q: How do you prevent the AI from giving away the solution?**
Prompt rules plus checks the server enforces: no code (a detector rejects code-like text), and a level-1 hint
must be a question. Bad output is retried once, then replaced by a standard hint. And I measured it: 0/20 level-1
hints gave the fix away; when I found level 2 leaking 17/19, I changed the design rather than the wording.

**Q: How do you handle prompt injection from student code?**
The code goes in delimited tags with an instruction to treat it as data, and every output is validated against
a schema and the no-code check. That reduces the risk; it can't rule it out, which is why outputs are validated
rather than trusted.

**Q: Why put the refresh token in a cookie and the access token in memory?**
A script injected into the page can read `localStorage` and steal a 30-day login; it can't read an httpOnly
cookie. The short-lived access token in memory limits what a stolen token is worth. I'm clear it doesn't stop an
injected script acting while the page is open; the CSP is the layer for that.

**Q: How did you get the client IP right behind proxies?**
I measured the `X-Forwarded-For` shape on the deployed service (3 hops on Render, 4 through Vercel) and set
Express's `trust proxy` to the exact count. For the Vercel path, the middleware sends the IP with a shared
secret, because trusting a header based on its shape would be spoofable.

### System design follow-ups

**Q: How would you support 10,000 students in live quizzes at once?**
Several API instances behind a load balancer, the Socket.io Redis adapter so a broadcast reaches sockets on every
instance, and a shared timer service (one instance closes each question, via a Redis lock). Redis close to the
API, and the batched teacher chart already avoids the O(n²) problem. Then load-test that setup, because my
current numbers are for one instance.

**Q: What if Redis goes down?**
Live games and judging pause (they depend on it); rate limiters fail open so logins keep working; tests, the
question bank and analytics (MongoDB) keep working. The health check reports Redis status.

**Q: What if the AI provider goes down?**
Students get standard hints and feedback, teachers get a clear "try again"; nothing breaks. The health check shows
the last AI error code.

**Q: Why not microservices?**
For one developer and one free server, a modular monolith is simpler to deploy, debug and keep consistent. The
one part that needed isolation for safety, the judge, is already a separate process with a queue between them,
so it could become its own service without changing the API.

**Q: Why MongoDB and not PostgreSQL?**
Question types differ a lot and tests store snapshots of questions; documents model that directly. The trade-off
is weaker relational guarantees: I don't use multi-document transactions, so multi-step deletes are ordered so
they can be safely retried. For heavy cross-entity reporting I'd consider Postgres.

## 11. Limitations and what I'd do next

- Performance numbers are from a laptop, not the hosted free tier; the judge has one worker.
- The judge is a V8 isolate, not a kernel sandbox; JavaScript only.
- Live games run on one instance (no Socket.io adapter yet).
- Styles in the CSP still allow inline (React style attributes).
- AI: level-2 hint re-run measured on 8 of 20 cases; reviews and generated questions not evaluated.
- Next: Redis near the API, more judge workers, the Socket.io Redis adapter, contest pause/extend/rejudge,
  deletes in database transactions.

## 12. Pitches: 30 seconds and 2 minutes

**30 seconds.** "I built ClassArena, a multi-tenant platform where institutes run timed tests, Kahoot-style live
quizzes and coding contests, with AI hints and teacher analytics. The interesting parts are a sandboxed code judge
in a separate process, real-time games on Socket.io and Redis, and security work like httpOnly cookies, a CSP and
rate limits. I load-tested it, found a quadratic slowdown, and cut the 200-player p99 from 1.9 seconds to 245 ms."

**2 minutes.** Problem (section 1) → architecture in one sentence (React on Vercel, Express + Socket.io on Render,
MongoDB for records, Redis for live state, a separate judge process) → two design decisions with trade-offs (the
judge choice, Redis for game state) → one challenge told fully (the load-test fix or the session-theft hole) →
how it's tested (unit, integration, browser tests in CI) → one honest limitation and what I'd do next.
