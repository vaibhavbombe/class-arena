# ClassArena

A multi-tenant classroom and competition platform for institutes. **Work in progress:** built so far
are accounts and classes (Phase 1), a question bank with timed, auto-graded tests (Phase 2),
Kahoot-style live quiz battles (Phase 3), JavaScript coding questions judged in a sandbox, for practice
and inside tests (Phase 4), live ICPC-style coding contests (Phase 5), a class analytics dashboard, and AI features
(Phase 6): hints and feedback on coding practice, and a question generator for teachers.

**Live:** https://class-arena-vsb10.vercel.app (the API runs on Render's free tier, so the
first request after it has been idle can take ~50 seconds)

## What works today
- **Institutes as tenants.** Signing up creates an institute and makes you its admin.
- **Three roles.**
  - *Admin*: sees every member and class in the institute, invites teachers or co-admins by email,
    removes members and hands a class to another teacher.
  - *Teacher*: creates and deletes classes, sees join codes and rosters, removes students from a class.
  - *Student*: signs up with a 6-character class join code and can join more classes from the dashboard.
- **Auth:** 15-minute JWT access tokens plus 30-day refresh tokens that rotate on every use,
  with an axios interceptor that refreshes silently on a 401.
- **Question bank** (teachers and admins): multiple choice, multi-select and short-answer questions
  with tags, difficulty, an explanation, search and filters. Teachers see their own questions; admins
  see the whole institute. Students can't reach it at all.
- **Tests** (authoring): a teacher builds a draft from bank questions with points, a duration, optional
  open/close times and shuffle options, then publishes it to a class. Students see only an outline
  (title, instructions, timing, question count, total points) until they start.
- **Taking tests** (students): start, answer with autosave and a countdown, submit. Graded on the server.
- **Results:** students see their score, their answers marked against the correct ones, and the
  explanations once the test closes (or when the teacher releases them early). Teachers get every
  enrolled student's status and score, average/median/highest/lowest, % correct per question,
  each student's marked answers, and a CSV export.
- **Live quizzes:** teachers build a quiz for a class from multiple choice and multi-select bank
  questions (5–120 seconds each), then run it as a Kahoot-style game: a 6-digit PIN and lobby, coloured
  answer tiles with shapes, a countdown, a reveal with the answer chart and top 5, and a final podium.
  Students play on their phones (enrolled students only). Results of past games are kept per quiz.
- **Class analytics** (teachers and admins): class average, participation, average by test over time,
  topic mastery by question tag (weakest first), the hardest questions, and every student's average,
  last score and missed tests, with a "needs attention" flag (average under 50% or 2+ missed tests).
- **Coding questions:** teachers write JavaScript questions in the bank with a
  function to implement, starter code, visible sample tests, hidden tests, time/memory limits and an
  optional reference solution, and can "check with judge" to run that solution against every test
  before saving.
- **Coding practice:** teachers add coding questions to a class as practice problems. Students write code
  in a Monaco editor, **Run** the sample tests in their browser (a Web Worker that's terminated if a test
  runs past the time limit), and **Submit** to the server judge, which also runs the hidden tests.
  Students see full details for samples and only pass/fail for hidden tests; teachers see who solved each
  problem, attempts, best result and each student's code.
- **Coding questions in timed tests:** worth points like any other question. Students answer in the same
  editor (autosaved, with Run on samples); after submit the judge grades each coding answer on the
  hidden tests, for points in proportion to tests passed (3 of 4 on a 4-point question = 3 points).
  Coding questions can't be used in live quizzes.
- **Live coding contests** (ICPC style): a teacher picks 1–12 coding questions (labelled A, B, C…), a start
  time or **Start now**, a duration, a penalty per wrong try and an optional freeze for the last minutes.
  Problems stay hidden until the start. Students solve them in the same editor and submit to the judge;
  a **live leaderboard** ranks by problems solved, then penalty time, marks the first solver of each
  problem with a star and updates over Socket.io as results come in. During the freeze students see the
  board as it was (newer tries show as “?”) while the teacher sees it live; it unfreezes at the end.
- **AI hints on coding practice:** up to 3 hints per problem, in order: a nudge, then the approach,
  then a step-by-step plan in plain words. Hints use the problem, the samples, the student's current code
  and their latest verdict, and never contain code. If the AI is off or fails, the student gets a fixed
  standard hint instead. Teachers see how many hints each student used. There are no hints in contests
  or timed tests.
- **AI feedback on submissions:** after a practice submission is judged, the student can ask for a
  short review of that code: a summary, what's good, what to improve and the time complexity, in words
  (never code or a fixed version). One review per submission, saved and also shown to the teacher.
  Fixed feedback based on the verdict is used if the AI is off or fails. Practice only.
- **AI question generator** (teachers and admins): describe a topic, pick a type (multiple choice,
  multi-select, short answer or coding), how many (up to 5, or 2 coding) and a difficulty, and get
  **drafts**. Nothing is saved until the teacher opens a draft in the normal editor, checks it and saves
  it. For coding drafts the server runs the AI's own reference solution against its tests in the judge
  and warns the teacher when it fails any.
- **Light and dark mode:** System (follows the device), Light or Dark, switchable from the header or the
  login pages and remembered per device.
- **Email:** teacher invites and "forgot password" reset links (Brevo HTTP API in production).

## Stack
React 18 + Vite, React Router, axios · Node.js + Express 5, Mongoose (MongoDB Atlas),
bcrypt, jsonwebtoken, Socket.io, Redis (ioredis), Brevo (production email) / nodemailer + Gmail (local) ·
Vercel (client), Render (server)

## Design decisions
- **The tenant comes from the token, never the request.** `institutionId` is signed into the
  access token; every tenant-scoped query filters on `req.institutionId` set by the auth middleware.
- **Role changes apply immediately.** The middleware re-reads the user on each request instead
  of trusting the role cached in a 15-minute token.
- **404 instead of 403** for classes outside your scope, so class ids from other institutes can't be probed.
- **Enrollment is its own collection** rather than an array on the class: rosters can grow without
  bound and "classes for this student" is one indexed query.
- **Single-use tokens are claimed atomically** (`findOneAndDelete` / `findOneAndUpdate`), so two
  parallel requests can't both use the same refresh token or invite.
- **Join codes** use an alphabet without 0/O/1/I/L (easy to read off a board) and are globally unique,
  because a new student signs up with only the code. Staff can regenerate a leaked code.
- **Request fields must be strings**, which blocks Mongo operator injection like `{"$gt": ""}`.
- **Tests keep their own copy of each question.** Adding a question copies it into the test, and
  publishing refreshes the copies one last time; after that, editing or deleting the bank question
  can't change the test, so grading always matches what students saw. Questions, points and timing
  lock on publish; title, instructions and closing time can still change (e.g. to extend a deadline).
- **Test status (draft / upcoming / open / closed) is computed from the server's clock**, never the browser's.
- **The timer is decided by the server.** Starting stores a deadline (start + duration, capped at the
  closing time); the browser only displays it, corrected for its own clock offset. There's no
  background job: any request that touches an attempt after its deadline submits it with the answers
  saved so far, so closing the browser doesn't escape the deadline. Saves get a 5-second grace
  period for network delay. Changing a test's closing time doesn't move deadlines already handed out.
- **The answer key never reaches the browser.** Students get questions without correct flags,
  accepted answers or explanations; question and option order can be shuffled per student
  (crypto-random, stored so a reload shows the same order).
- **Autosave is per answer** (an atomic `$set` of one array element). Each save bumps a `revision`,
  and submit only finalises if the revision it graded is still current; otherwise it re-grades. A
  test that fires saves and a submit at the same time checks the stored score always matches the
  stored answers.
- **One attempt per student per test** is a unique database index, so double-clicking Start can't
  create two attempts. A test that students have started can't be deleted.
- **Grading:** multiple choice is right or wrong; multi-select is all-or-nothing (the exact set of
  correct options; no partial credit yet); short answers match after trimming, collapsing spaces and
  (unless the question is case-sensitive) ignoring case.
- **Answers are revealed only after the test closes** (plus the grace period), unless the teacher
  releases them early, so someone who finished can't pass answers to someone still taking it. Opening
  the results page first submits any attempt whose time is up, so it never shows stale "in progress" rows.
- **CSV export guards against formula injection:** cells starting with `=`, `+`, `-` or `@` get a
  leading apostrophe, so a student named `=HYPERLINK(...)` can't run a formula in the teacher's spreadsheet.
- **Sockets use the same login as the API.** A Socket.io connection must send the access token; the
  server verifies it and reloads the user, so a removed user's unexpired token can't open a socket either.
- **Redis keys are prefixed by environment** (`dev:`, `test:`, `prod:`), so local runs, integration tests
  and production can share one Redis database without seeing each other's data.
- **The live game is server-authoritative.** The server opens and closes each question on its own
  clock, decides whether an answer counts and computes points:
  `correct ? round(1000 × (1 − (time taken ÷ time limit) ÷ 2)) : 0` (Kahoot's formula). Players get each
  question without the answer key; the correct option is only sent at the reveal.
- **Game state lives in Redis; the answer key doesn't.** Players, answers and the leaderboard (a sorted
  set) are in Redis so any refreshed screen can rejoin mid-game. Accepting an answer is one Lua script
  (question still open, deadline not passed, first answer from this player, add the points), so five
  simultaneous taps score once. State changes (lobby → question → reveal → … → ended) are
  compare-and-set scripts, so the timer and the teacher's "skip" can't both close a question. If the
  server restarts mid-question, the next event closes the overdue question. Final standings and
  per-question stats are saved to MongoDB; Redis keys expire after 3 hours.
- **Joining needs the PIN and enrolment in the class.** A wrong PIN and a PIN for another class get the
  same "not found", so PINs can't be probed.
- **Hidden tests stay on the server.** Coding questions live in the staff-only question bank; students
  will only ever receive the sample tests. Test data is stored as plain JSON (round-tripped through
  `JSON.stringify`), and "check with judge" runs through the same sandboxed worker as students' code.
- **Submissions are queued, not awaited.** Submit answers `202 queued` immediately; the worker's
  result is saved by a listener on the judge's pub/sub channel, and the page polls the submission. So a
  long queue never times out a request, and a result published while the API restarts is picked up the
  next time anyone looks (a submission still queued after 3 minutes becomes "Judge Error"). Students can
  submit once every 5 seconds (a Redis rate limit). The judge returns full details to the API only; the
  API reduces hidden tests to pass/fail before saving or sending anything.
- **Coding answers in tests are graded after submit, atomically.** Other questions are graded at once; each
  coding answer is queued for the judge against the hidden tests only (so hard-coding the visible samples
  earns nothing). Each result sets that question's points and re-sums the score in a single MongoDB
  update pipeline, so results arriving together can't overwrite each other. Grading always ends: results
  missed by the listener are picked up when the attempt is next read, and after 3 minutes a lost job
  scores 0 as "Judge Error".
- **Contest timing and ranking are decided on the server.** Status (upcoming, running, frozen, ended) is
  computed from the start time and the server's clock on every request, never stored or sent by the
  client; submissions are timed by the server's `createdAt` and refused outside the window. Ranking is a
  pure, unit-tested function (`lib/contestRules.js`): solved count, then penalty = minutes to each first
  accepted submission + the penalty for each earlier wrong try on that problem (unsolved problems and
  compile/judge errors cost nothing, as in ICPC), then the earlier last solve. Equal solved and penalty
  share a rank.
- **Contest updates are a ping, not the board.** When a submission is queued or judged the server emits
  `contest:updated` to the contest's Socket.io room and each screen refetches `/standings`. During the
  freeze a student and a teacher must see different boards, so building the board per viewer over HTTP
  keeps the freeze rule in one place instead of broadcasting data that a client could read early. Joining
  the room uses the same access check as the HTTP API.
- **AI output is untrusted input.** All AI calls go through one server-side module (`lib/ai/client.js`;
  the key never reaches the browser and only a fingerprint is logged). Every reply must be JSON that
  passes a schema check (`lib/ai/schema.js`); hints are also rejected if they look like code. A bad
  reply or a temporary error (timeout, 429, 5xx) is retried once, then the caller falls back to a fixed
  hint, so the feature never breaks when the AI does. The model never gets hidden tests or the reference
  solution, so it can't leak them, and the student's code is passed as delimited data with an instruction
  to ignore instructions inside it (this reduces prompt injection; it can't rule it out).
- **AI drafts pass the same validator as hand-written questions.** The generator's reply must match
  a schema and every draft must pass `parseQuestionInput` (e.g. exactly one correct MCQ option, no
  duplicate options, valid tests), so a reply that breaks a rule is retried, and if it still fails the
  teacher gets a clear error instead of a broken question. The teacher review step is the real safety
  check: the AI can still be confidently wrong, which validation can't catch.
- **AI cost has three limits.** Each student gets 30 AI hints and 20 reviews a day, each teacher 20 generations a day,
  and each institute 500 AI calls in total (Redis counters; past the institute limit students still get
  standard hints), with one hint per 10 seconds and one generation per 15 seconds. A review is claimed with one atomic
  update before the AI call, so two clicks never pay twice; a claim that never finished can be retaken
  after 90 seconds.
  Each hint is saved once (a unique index on problem, student and level), so reloading or double-clicking
  never pays twice. The hard cap is the credit limit set on the OpenRouter key itself. The default model
  is `anthropic/claude-haiku-5.5`, chosen for price; `AI_MODEL` changes it.
- **Student code never runs in the API process.** The API puts a job on a Redis queue; a separate judge
  worker process (restarted automatically, killed by a 30 s watchdog if a job hangs) runs it in a fresh
  V8 isolate via `isolated-vm`: no Node APIs (no require, files, network, process or timers), a memory
  cap per isolate, a CPU time limit per test, a fresh context per test so no state leaks between tests,
  and capped output and console logs. The worker's environment holds only the Redis URL, not the
  database URL, JWT secret or email keys. Hidden-test results contain only pass/fail, verdict and time.
- **Analytics are a pure function** (`lib/analytics.js`) over tests, submitted attempts and the current
  roster, so the numbers are unit-tested. Participation counts only tests that have opened and only
  students still in the class. Test copies keep their questions' tags; older tests fall back to the bank
  question's current tags. Chart colours were checked with a palette validator (lightness band and
  contrast) separately for the light and dark surfaces.
- **Theming with CSS variables.** Every colour in the UI is a CSS variable with a light and a dark value,
  so switching theme only changes one attribute on `<html>`. A tiny script in `index.html` applies the
  saved choice before the first paint, so dark-mode users never see a white flash. Solid colours used
  behind white text (buttons, header) have their own tokens so they stay readable in both modes.
- **Password rules are enforced on the server** (8–72 characters with upper and lower case, a number
  and a special character) wherever a password is set; the form's live checklist is only a hint.
  Login doesn't apply them, so older accounts still work. The 72 cap is because bcrypt ignores
  anything past 72 bytes. (NIST SP 800-63B prefers length plus breached-password checks over
  composition rules; a breached-password check is not implemented.)
- **Rate limits count failures, not people.** A whole school can share one public IP, so per-IP limits are
  generous (e.g. 200 logins per 15 minutes) and only stop floods. Guessing is stopped by counting *failures*
  per target in Redis (`lib/limits.js` lists every limit): 10 wrong passwords per account per IP in 15
  minutes (cleared by a successful login) plus 50 per account from anywhere per hour, 10 wrong class codes
  per student, 20 wrong codes per IP at signup, and 20 wrong game PINs per student. The check runs before
  bcrypt, treats unknown emails exactly like real ones, and answers 429 with `Retry-After`. Behind Render's
  proxy the client IP comes from `X-Forwarded-For` with Express's `trust proxy` set to the exact number of
  proxy hops, so a client can't pick its own IP by sending that header.
- **Password reset doesn't reveal who has an account.** "Forgot password" gives the same answer for
  any email and sends the email in the background, so response time doesn't leak it either. Only a
  SHA-256 hash of the reset token is stored; links are single-use, expire in 30 minutes, are limited
  to one per account per minute, and a successful reset signs out every existing session.

## Known limitations
- Rate limits use fixed windows (a burst at a window edge can get up to twice the limit through), and if Redis
  is down they allow everything rather than block logins. A determined attacker spreading guesses across many
  IPs is slowed (50 failures per account per hour) but not stopped; there is no CAPTCHA or account lockout email.
- One email address can belong to only one institute.
- Students can't leave a class themselves, and classes can't be renamed yet.
- Removing a member or deleting a class runs several deletes without a transaction; they're ordered
  so a failure halfway can be retried, but nothing rolls back automatically.
- Tokens live in `localStorage`, which is readable by any script running on the page (XSS risk);
  httpOnly cookies would be safer.
- There are no browser (end-to-end UI) tests; the UI has only been checked by hand.
- The code judge runs JavaScript only. A V8 isolate is a weaker boundary than a kernel-level sandbox
  (namespaces/seccomp, as in Judge0), and the worker shares the host with the API on Render's single
  free instance; a dedicated judge host with a kernel sandbox would be the next step for untrusted
  traffic at scale. Jobs are judged one at a time by a single worker.
- Live games run on a single server instance (timers are in-process; Render's free tier runs one). Scaling
  out would need the Socket.io Redis adapter and a shared timer. See **Performance** below for measured numbers and **Testing**
  for what is covered.
- Contests: the board is recomputed from all submissions on each request (fine for a class, but a
  large contest would need a cached or incremental board); a contest can't be paused, extended or
  ended early; there is no rejudge; and only JavaScript is supported.
- AI: there is no feedback in contests or timed tests (by design: it would be help during an
  assessment). The quality of hints, reviews and generated questions hasn't been measured yet (no evaluation set or
  user feedback), the daily limits are fixed in code, everything is English only, and generated MCQs
  are only as correct as the teacher's review (the judge check exists for coding drafts only).
- Multi-select has no partial credit, and short answers are exact matches after normalising (no
  fuzzy matching or manual regrading yet).
- The Render free tier sleeps when idle, so the first request after a while can take ~50 seconds.
- Invite emails are sent from a personal address (Brevo free tier, 300/day) and can land in spam.
  If sending fails, the admin still gets the invite link to share by hand.

## Run locally
Requires Node 22 (the code judge uses `isolated-vm` 5, whose prebuilt binary doesn't load on Node 24;
after switching Node versions run `npm rebuild isolated-vm`) and a MongoDB Atlas (or local MongoDB) connection string.

```powershell
cd server
copy .env.example .env   # then fill in the values
npm install
npm run dev              # http://localhost:5002
npm test                 # unit tests (no database needed)
npm run test:integration # API suites; needs a database whose name ends in -dev or -test

cd ..\client
copy .env.example .env   # VITE_API_URL=http://localhost:5002
npm install
npm run dev              # http://localhost:5178
```

Server environment variables:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string, including the database name |
| `JWT_ACCESS_SECRET` | Long random string for signing access tokens |
| `CLIENT_URL` | Client origin, used for CORS and invite links (no trailing slash) |
| `BREVO_API_KEY`, `MAIL_FROM` | Production email via Brevo's HTTP API (`MAIL_FROM` must be a verified sender) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Local email via Gmail SMTP, used when `BREVO_API_KEY` is not set |
| `REDIS_URL` | Redis for live game state (Phase 3). Use a TLS `rediss://` URL in production |
| `PORT` | Defaults to 5002 |

## Testing
- **Unit tests** (`npm test`, 114 tests, Node's built-in runner): the pure logic — question validation,
  test rules, grading, attempt rules (deadlines, grace period, shuffling, and that nothing sent to
  students contains answers), results statistics, class analytics, contest ranking (penalties, ties, first solves, the freeze), the AI client (schema checks, retry, timeouts, no retry on 401, the key never logged) and hint rules (code detection, prompt contents, fallbacks), the question generator's validation, feedback rules, and the code judge (every verdict,
  sandbox-escape probes, limits that can't be raised, and that the worker gets no app secrets).
- **Integration tests** (`npm run test:integration`, 23 suites, 335 checks; add suite names to run only those): start the API on a spare
  port with email disabled and exercise it over HTTP against a real MongoDB database — roles and
  tenant isolation, invites, password reset and rules, member management, question bank, tests,
  taking tests (including five simultaneous "Start" clicks and an expired deadline), results, and a
  race between autosaves and submit, Socket.io authentication, live quiz authoring, full live games
  over Socket.io (joining rules, timing, scoring, simultaneous answers, rejoin after refresh), and the
  judge queue and worker (infinite loops, memory bombs, simultaneous submissions), and coding contests
  (problems hidden before the start, submissions refused outside the window, ICPC penalties, the freeze
  for students vs. the live board for teachers, Socket.io update pings, other institutes locked out), and AI hints against a local fake AI server, so no
  real key or money is used (levels in order, retry of a bad reply, fallback when the AI returns code or is
  down, daily and per-click limits, and that the AI never receives hidden tests or the reference solution) and the question generator
  (drafts not saved, retry, rule-breaking output never returned, coding drafts checked in the judge,
  limits) and submission feedback (one review per submission even on a double click, no code, fallback,
  only the submitting student, limits), and rate limits (run against a second API with limits on and fresh
  counters: failed logins, unknown emails treated the same, reset on success, spoofed X-Forwarded-For ignored,
  wrong class codes and game PINs, signups per IP). The runner refuses databases whose names don't end in `-dev`
  or `-test`, so it can't touch production. They leave their test data behind in that database.
- **Load test** (`npm run loadtest`): simulated students in live quizzes and a contest; see **Performance** below.
  It measures, it doesn't pass or fail, and it isn't run automatically.
- Not covered: the React UI (checked by hand and with screenshots), performance of the hosted deployment, and email
  delivery itself.

## Performance (measured)

`npm run loadtest` (in `server/`) starts its own API (email and AI off) and simulates students. Numbers below are
from **one run of each scenario on a laptop** (AMD Ryzen 7 5800HS, 16 threads, Windows 11, Node 22) with the API and the
load generator on the same machine, MongoDB Atlas and Upstash Redis (TLS) as remote services. They describe this setup,
**not the hosted Render free tier**, which hasn't been load-tested. Raw results: `server/loadtest/results/`.

**Live quiz** (5 multiple-choice questions; every student connects, joins with the PIN and answers each question after
a random 0.3–2.5 s; times on the load generator's clock). All runs: every student connected, every answer accepted, 0 errors.

| Players | Question reaches player p50 / p95 | Answer acknowledged p50 / p95 / p99 | Reveal after last answer p50 / p95 |
|---|---|---|---|
| 50 | 150 / 156 ms | 216 / 234 / 662 ms | 581 / 588 ms |
| 100 | 149 / 154 ms | 215 / 226 / 247 ms | 586 / 596 ms |
| 200 | 156 / 170 ms | 214 / 227 / 245 ms | 605 / 627 ms |

- **A bottleneck the load test found, and the fix.** The first run at 200 players had an answer p99 of **1,936 ms** and
  reveal p50 of 961 ms. Each answer rebuilt the teacher's live chart by reading *every* answer and *every* player from
  Redis, which is O(players) work per answer and O(players²) per question. Now the player count is one `HLEN` and the
  chart is sent at most every 250 ms (first answer immediately, plus one trailing update). The same 200-player test gave
  p99 **245 ms**, and latency no longer grows from 50 to 200 players.
- **Where the remaining time goes.** A Redis round trip from this machine to Upstash measured **~69 ms** (MongoDB Atlas:
  ~7 ms). Handling an answer makes 3 sequential Redis calls (state, the atomic answer script, player count), about
  207 ms, which matches the ~215 ms p50. Redis in the same region as the API, or folding the count into the Lua script,
  would cut most of it; neither has been done or measured.

**Contest judge** (50 students submit at the same moment: 60% correct, 20% wrong answer, 20% infinite loops; 6 tests
each with a 300 ms limit; times from the server's own `createdAt`/`judgedAt`). All 50 judged with the expected
verdict, 0 errors.

| Submit acknowledged (202) p50 / p95 | Queued → verdict saved p50 / p95 / max | All 50 judged in | Throughput |
|---|---|---|---|
| 1,814 / 1,848 ms | 13.1 / 29.7 / 30.6 s | 31.8 s | 1.57 submissions/s |

- The judge is one worker process judging one submission at a time, and infinite loops dominate: each one runs until
  its time limit. More workers would raise throughput roughly linearly on a machine with spare cores; that hasn't
  been built.
- Why the submit acknowledgement takes ~1.8 s when 50 requests arrive together hasn't been investigated yet.

## Demo data

`node scripts/seed-demo.js --api=http://localhost:5002 --password=<password>` (in `server/`, with the API running)
creates a demo institute through the public API, so everything passes the normal validation: a teacher, 8 students,
a question bank (whose coding questions are checked in the judge first), two tests taken by every student (so the
analytics have data), coding practice with submissions and a running contest. It refuses non-local APIs unless
`--production` is passed; `--tag=x` makes the emails unique so it can run again. The demo admin can send invite
emails, so only the teacher and student logins should be shared. Contest solves all land in the first minute,
because the API (correctly) doesn't allow backdating submissions.

## API
| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/signup` | anyone: creates institute + admin |
| POST | `/api/auth/student-signup` | anyone with a join code |
| POST | `/api/auth/login`, `/refresh`, `/logout` | anyone |
| POST | `/api/auth/forgot-password`, `/reset-password` | anyone |
| GET | `/api/me` | logged in |
| GET | `/api/members?role=` | admin |
| POST | `/api/invites` | admin |
| POST | `/api/invites/accept` | anyone with an invite token |
| GET / POST | `/api/classes` | list: all roles (scoped) · create: teacher, admin |
| POST | `/api/classes/join` | student |
| GET | `/api/classes/:id` | anyone who can see the class |
| POST | `/api/classes/:id/join-code` | class teacher, admin |
| DELETE | `/api/classes/:id` | class teacher, admin |
| DELETE | `/api/classes/:id/students/:studentId` | class teacher, admin |
| PATCH | `/api/classes/:id/teacher` | admin |
| DELETE | `/api/members/:id` | admin (not yourself; teachers must have no classes) |
| GET / POST | `/api/questions` (`?type=&tag=&q=`) | teacher (own), admin (all) |
| GET | `/api/questions/tags` | teacher, admin |
| GET / PUT / DELETE | `/api/questions/:id` | owner, admin |
| POST | `/api/questions/check-code` | teacher, admin (runs a solution against all tests in the judge) |
| GET / POST | `/api/problems` (`?classId=`) | class members / class teacher, admin (assign a coding question) |
| GET / DELETE | `/api/problems/:id` | class members (students: no hidden tests) / class teacher, admin |
| POST | `/api/problems/:id/submit` | student in the class (queued; 1 per 5 s) |
| GET | `/api/problems/:id/submissions/:submissionId` | the student who submitted, class teacher, admin |
| POST | `/api/problems/:id/hints` (`{ code? }`) | student in the class (next hint, levels 1–3; 1 per 10 s) |
| POST | `/api/problems/:id/submissions/:submissionId/feedback` | the student who submitted (one review per submission) |
| POST | `/api/questions/generate` (`{ topic, type, count, difficulty, notes? }`) | teacher, admin (returns drafts; saves nothing) |
| GET / POST | `/api/contests` (`?classId=`) | class members (students: published only) / class teacher, admin |
| GET / PUT / DELETE | `/api/contests/:id` | class members (students: no problems before the start, never hidden tests) / class teacher, admin (settings only before the start) |
| POST | `/api/contests/:id/publish` (`{ published }`) · `/api/contests/:id/start` | class teacher, admin |
| GET | `/api/contests/:id/standings` | class members (frozen for students during the freeze) |
| POST | `/api/contests/:id/problems/:index/submit` | student in the class, while the contest runs (queued; 1 per 5 s) |
| GET | `/api/contests/:id/submissions/:submissionId` | the student who submitted, class teacher, admin |
| Socket.io | `contest:watch` → `contest:updated` pings | class members |
| GET | `/api/tests?classId=` | staff (all), students (published outlines) |
| POST | `/api/tests` | class teacher, admin (creates a draft) |
| GET | `/api/tests/:id` | staff (full, with answers), students (outline only) |
| PUT / DELETE | `/api/tests/:id` | class teacher, admin |
| POST | `/api/tests/:id/publish` | class teacher, admin |
| POST / GET | `/api/tests/:id/attempt` | student in the class (start or resume / current state) |
| PUT | `/api/tests/:id/attempt/answers` | student (autosave) |
| POST | `/api/tests/:id/attempt/submit` | student |
| POST | `/api/tests/:id/release` (`{ released }`) | class teacher, admin |
| GET / POST | `/api/live-quizzes` (`?classId=`) | class teacher, admin |
| GET / PUT / DELETE | `/api/live-quizzes/:id` | class teacher, admin |
| POST | `/api/live-games` (`{ quizId }`) | class teacher, admin (creates a game + PIN) |
| GET | `/api/live-games/active?classId=` | class members |
| GET | `/api/live-games?quizId=` · `/api/live-games/:id` | class teacher, admin (past games, results) |
| Socket.io | `host:join/next/skip/end`, `player:join/answer` | host: class teacher or admin; player: enrolled student |
| GET | `/api/tests/:id/results` | class teacher, admin |
| GET | `/api/classes/:id/analytics` | class teacher, admin |
| GET | `/api/tests/:id/results/:studentId` | class teacher, admin |

## Roadmap
7. A load test with measured numbers (simulated students in live games and contests) and demo data
