# ClassArena

A multi-tenant classroom and competition platform for institutes. **Work in progress:**
Phase 1 (accounts, roles, classes) is built. Tests, live quizzes, coding contests and
AI features are planned and do not exist yet.

## What works today (Phase 1)
- **Institutes as tenants.** Signing up creates an institute and makes you its admin.
- **Three roles.**
  - *Admin*: sees every member and class in the institute, invites teachers or co-admins by email.
  - *Teacher*: creates classes, sees join codes and rosters for their own classes.
  - *Student*: signs up with a 6-character class join code and can join more classes from the dashboard.
- **Auth:** 15-minute JWT access tokens plus 30-day refresh tokens that rotate on every use,
  with an axios interceptor that refreshes silently on a 401.

## Stack
React 18 + Vite, React Router, axios · Node.js + Express 5, Mongoose (MongoDB Atlas),
bcrypt, jsonwebtoken, nodemailer (Gmail) · Vercel (client), Render (server)

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

## Known limitations
- No rate limiting yet, so login and join codes could be brute-forced.
- One email address can belong to only one institute.
- Students can't leave a class and staff can't remove them; classes can't be edited or deleted.
- Tokens live in `localStorage`, which is readable by any script running on the page (XSS risk);
  httpOnly cookies would be safer.
- No automated test suite in the repo yet. Phase 1 was checked with manual API smoke scripts
  and by clicking through the UI.
- The Render free tier sleeps when idle, so the first request after a while can take ~50 seconds.
- Invite emails go through a personal Gmail account and can land in spam.

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
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sends invite emails (Gmail app password) |
| `PORT` | Defaults to 5002 |

## API (Phase 1)
| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/signup` | anyone: creates institute + admin |
| POST | `/api/auth/student-signup` | anyone with a join code |
| POST | `/api/auth/login`, `/refresh`, `/logout` | anyone |
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
