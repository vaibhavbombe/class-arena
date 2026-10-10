# ClassArena

A multi-tenant classroom and competition platform for institutes. **Work in progress:**
Phases 1 (accounts, roles, classes) and 2 (question bank, timed tests, server-side grading,
results) are built. Phase 3 (live quiz battles) works end to end: authoring, Kahoot-style games with a
server-run timer, speed-based scoring and a Redis leaderboard. Coding contests and AI features are
planned and do not exist yet.

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
  see the whole institute. Students can't reach it at all. Code questions come with the judge in Phase 4.
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
- **Coding questions (Phase 4, in progress):** teachers write JavaScript questions in the bank with a
  function to implement, starter code, visible sample tests, hidden tests, time/memory limits and an
  optional reference solution, and can "check with judge" to run that solution against every test
  before saving. The student editor and submitting code are not built yet, and coding questions can't
  be used in tests or live quizzes so far.
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
- **Password reset doesn't reveal who has an account.** "Forgot password" gives the same answer for
  any email and sends the email in the background, so response time doesn't leak it either. Only a
  SHA-256 hash of the reset token is stored; links are single-use, expire in 30 minutes, are limited
  to one per account per minute, and a successful reset signs out every existing session.

## Known limitations
- No rate limiting yet, so login and join codes could be brute-forced.
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
  out would need the Socket.io Redis adapter and a shared timer. The game hasn't been load-tested yet. See **Testing** below
  for what is covered.
- Multi-select has no partial credit, and short answers are exact matches after normalising (no
  fuzzy matching or manual regrading yet).
- The Render free tier sleeps when idle, so the first request after a while can take ~50 seconds.
- Invite emails are sent from a personal address (Brevo free tier, 300/day) and can land in spam.
  If sending fails, the admin still gets the invite link to share by hand.

## Run locally
Requires Node 22 (the code judge uses `isolated-vm`; Node 20.19+ also works) and a MongoDB Atlas (or local MongoDB) connection string.

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
- **Unit tests** (`npm test`, 78 tests, Node's built-in runner): the pure logic — question validation,
  test rules, grading, attempt rules (deadlines, grace period, shuffling, and that nothing sent to
  students contains answers), results statistics, class analytics, and the code judge (every verdict,
  sandbox-escape probes, limits that can't be raised, and that the worker gets no app secrets).
- **Integration tests** (`npm run test:integration`, 16 suites, 217 checks): start the API on a spare
  port with email disabled and exercise it over HTTP against a real MongoDB database — roles and
  tenant isolation, invites, password reset and rules, member management, question bank, tests,
  taking tests (including five simultaneous "Start" clicks and an expired deadline), results, and a
  race between autosaves and submit, Socket.io authentication, live quiz authoring, full live games
  over Socket.io (joining rules, timing, scoring, simultaneous answers, rejoin after refresh), and the
  judge queue and worker (infinite loops, memory bombs, simultaneous submissions). The runner refuses databases whose names don't end in `-dev`
  or `-test`, so it can't touch production. They leave their test data behind in that database.
- Not covered: the React UI, load/performance, and email delivery itself.

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
3. Live quiz battles (Socket.io, Redis leaderboard)
4. Coding problems with a sandboxed judge (including code questions in tests)
5. Live coding contests
6. AI hints, question generation and feedback
7. Teacher analytics and a load test
