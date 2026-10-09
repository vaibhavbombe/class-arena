# ClassArena

A multi-tenant classroom and competition platform for institutes. **Work in progress:**
Phase 1 (accounts, roles, classes) is built. Phase 2 is in progress: question bank, test authoring
and taking timed tests with server-side grading work; showing results is next. Live quizzes, coding contests and AI features are planned
and do not exist yet.

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
  Students see "Submitted" for now; scores and answer review come in the next step.
- **Email:** teacher invites and "forgot password" reset links (Brevo HTTP API in production).

## Stack
React 18 + Vite, React Router, axios · Node.js + Express 5, Mongoose (MongoDB Atlas),
bcrypt, jsonwebtoken, Brevo (production email) / nodemailer + Gmail (local) · Vercel (client), Render (server)

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
- Automated tests are thin so far: unit tests (`npm test` in `server/`) cover question validation
  test rules, grading and attempt rules (deadlines, grace period, shuffling, and that what students
  receive never includes answers).
  API flows were checked with smoke scripts run against a separate dev database; those scripts
  are not in the repo yet.
- The Render free tier sleeps when idle, so the first request after a while can take ~50 seconds.
- Invite emails are sent from a personal address (Brevo free tier, 300/day) and can land in spam.
  If sending fails, the admin still gets the invite link to share by hand.

## Run locally
Requires Node 20.19+ and a MongoDB Atlas (or local MongoDB) connection string.

```powershell
cd server
copy .env.example .env   # then fill in the values
npm install
npm run dev              # http://localhost:5002
npm test                 # unit tests (no database needed)

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
| `PORT` | Defaults to 5002 |

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
| GET | `/api/tests?classId=` | staff (all), students (published outlines) |
| POST | `/api/tests` | class teacher, admin (creates a draft) |
| GET | `/api/tests/:id` | staff (full, with answers), students (outline only) |
| PUT / DELETE | `/api/tests/:id` | class teacher, admin |
| POST | `/api/tests/:id/publish` | class teacher, admin |
| POST / GET | `/api/tests/:id/attempt` | student in the class (start or resume / current state) |
| PUT | `/api/tests/:id/attempt/answers` | student (autosave) |
| POST | `/api/tests/:id/attempt/submit` | student |

## Roadmap
2. Question bank and timed tests with auto-grading
3. Live quiz battles (Socket.io, Redis leaderboard)
4. Coding problems with a sandboxed judge
5. Live coding contests
6. AI hints, question generation and feedback
7. Teacher analytics and a load test
