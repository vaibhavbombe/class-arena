# ClassArena

A multi-tenant classroom and competition platform for institutes. **Work in progress:**
Phase 1 (accounts, roles, classes) is built. Tests, live quizzes, coding contests and
AI features are planned and do not exist yet.

**Live:** https://class-arena-vsb10.vercel.app (the API runs on Render's free tier, so the
first request after it has been idle can take ~50 seconds)

## What works today (Phase 1)
- **Institutes as tenants.** Signing up creates an institute and makes you its admin.
- **Three roles.**
  - *Admin*: sees every member and class in the institute, invites teachers or co-admins by email.
  - *Teacher*: creates classes, sees join codes and rosters for their own classes.
  - *Student*: signs up with a 6-character class join code and can join more classes from the dashboard.
- **Auth:** 15-minute JWT access tokens plus 30-day refresh tokens that rotate on every use,
  with an axios interceptor that refreshes silently on a 401.
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
- Students can't leave a class and staff can't remove them; classes can't be edited or deleted.
- Tokens live in `localStorage`, which is readable by any script running on the page (XSS risk);
  httpOnly cookies would be safer.
- No automated test suite in the repo yet. Phase 1 was checked with manual API smoke scripts
  and by clicking through the UI.
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

## API (Phase 1)
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

## Roadmap
2. Question bank and timed tests with auto-grading
3. Live quiz battles (Socket.io, Redis leaderboard)
4. Coding problems with a sandboxed judge
5. Live coding contests
6. AI hints, question generation and feedback
7. Teacher analytics and a load test
