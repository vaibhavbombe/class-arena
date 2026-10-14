# Engineering notes: problems found while building ClassArena

The README lists what the app does and the design decisions. This file is the other half: real problems
that turned up during development, **how each was found**, the fix, and the evidence. Every number here
was measured; where something is unknown or unfinished, it says so.

**Links:** [live app](https://class-arena-vsb10.vercel.app) ·
[API health](https://class-arena-server.onrender.com/api/health) ·
[source code](https://github.com/vaibhavbombe/class-arena) ·
[CI runs](https://github.com/vaibhavbombe/class-arena/actions/workflows/ci.yml)

---

## 1. The live quiz did O(players²) work per question (found by the load test)

- **Found by:** `npm run loadtest` with 50, 100 and 200 simulated students in one live quiz. At 200 players the
  slowest answers (p99) took **1,936 ms** to be acknowledged, while p50 stayed near 300 ms.
- **Cause:** every answer rebuilt the teacher's live chart by reading *every* answer and *every* player from
  Redis. That is O(players) per answer, so O(players²) per question.
- **Fix:** the player count became one `HLEN`, and the chart is sent at most every 250 ms (the first answer
  immediately, then one trailing update).
- **Evidence:** same test, 200 players: p99 **245 ms**, flat from 50 to 200 players.
- **What's left:** about 215 ms per answer, which matches 3 sequential Redis calls at a measured **~69 ms**
  round trip to Upstash. Redis in the API's region, or folding the count into the Lua script, would cut most
  of it; not done.

## 2. The last player to answer missed their result (found by a browser test)

- **Found by:** a Playwright test with a teacher and a student in two browsers. The teacher's screen showed
  the reveal; the student's stayed on "Answer locked in!". It failed 4 times out of 4.
- **Cause:** when the last answer arrived, the server closed the question and broadcast the reveal
  **before** acknowledging that answer. The client handled the reveal, then the late acknowledgement set the
  screen back to "answered". The integration tests check socket events, not what the screen shows, so they
  never saw it.
- **Fix (both sides):** the server replies to the answer first and closes the question right after; the client
  only moves from "question" to "answered", never back from the reveal.
- **Evidence:** 4 out of 4 passes after the fix; the test runs in CI.

## 3. Rate limits saw a proxy's IP instead of the student's (found by measuring production)

- **Found by:** a temporary endpoint that reported only counts and booleans about `X-Forwarded-For`, never
  an address. On Render a request carries **3** entries; with Express trusting 1 hop, `req.ip` was a Render
  proxy, so per-IP limits were nearly site-wide.
- **Fix:** trust exactly 3 hops; re-checked live that `req.ip` is the first entry, and that a made-up
  `X-Forwarded-For` doesn't change it.
- **Then it happened again:** auth requests later went through Vercel (see 5), which adds a 4th entry. Instead
  of "trusting 4 when it looks like Vercel" (spoofable), the Vercel middleware sends the client IP plus a
  shared secret, and the API believes that IP only when the secret matches (constant-time compare). Verified
  live: correct IP through Vercel; a direct call with a guessed secret is ignored.
- **Lesson:** don't guess proxy topology, measure it on the deployed service.

## 4. Running a student's code could have stolen a teacher's session (found while designing the CSP)

- **Found by:** listing what the Content-Security-Policy would have to allow. "Run" executes code with
  `new Function` in a Web Worker on the site's own origin, and a **teacher can run a student's code**. That
  worker could call `/api/auth/refresh` with the teacher's cookie and send the new token anywhere.
- **Fix:** the worker file gets its own policy: `default-src 'none'; script-src 'self' 'unsafe-eval';
  connect-src 'none'`. It can evaluate code, but can't make any request.
- **Evidence:** a browser test runs student code that tries a synchronous request to the refresh endpoint;
  the output shows "request blocked". **Negative control:** with `connect-src 'none'` removed, the same test
  fails. All browser tests now run against the production build with the real headers, and any CSP violation
  fails a test.

## 5. httpOnly cookies across two sites (Vercel client, Render API)

- **Problem:** moving the refresh token from `localStorage` into an httpOnly cookie. The client and API are on
  different sites, and Safari blocks third-party cookies, so a cookie set by the API would break logins there.
- **Fix:** the browser sends auth requests to the client's own domain; a Vercel middleware forwards them to
  the API, so the cookie is first-party (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth`). The access token
  lives in memory only; sockets keep using it, so WebSockets never go through Vercel.
- **Details that mattered:** concurrent refreshes share one request; if another tab already rotated the cookie,
  the refresh retries once instead of logging the user out; old `localStorage` sessions were moved over once
  by a temporary path that accepted the token in the request body, removed a day later (now only the cookie
  is accepted, and a test checks that a token in the body is refused).
- **Evidence:** a live browser check on the deployed site: no tokens in `localStorage`, the cookie invisible to
  `document.cookie`, still logged in after a reload, cookie gone after logout.
- **Honest limit:** an injected script can still act while the page is open; the cookie stops it carrying a
  30-day login away.

## 6. AI output treated as untrusted input

- **Design:** every model reply must be JSON that passes a schema check; generated questions must also pass the
  same validator as hand-written ones; hints and reviews are rejected if they contain code. A bad reply is
  retried once, then a fixed standard hint, review or a clear error takes over, so the feature never breaks
  when the model does. The model never sees hidden tests or reference solutions.
- **Found in production:** the free model answered **429** (rate-limited). The API now sends a fallback list of
  free models (OpenRouter's `models` parameter) and `/api/health` reports the last AI error code, so the cause
  was visible without server logs.
- **Measured hint quality** (20 beginner bugs, one human reviewer, see `server/eval/results/`):
  - Level 1 (a question): **0/20** gave the fix away after the server started rejecting non-questions.
  - Level 2 as "the approach": spelled out the fix **17/19** times despite being told not to.
  - Levels reordered to question → *where* the problem is → the change. Re-run on 8 cases before the free daily
    allowance ran out: **0/8** gave the fix (8/8 before). The other 12 cases are still unmeasured.
  - Keyword scoring caught only 5 of the 17 leaks, so it's a regression signal, not the measurement.

## 7. Student code never runs in the API process

- `isolated-vm` isolates in a **separate worker process** forked by a supervisor, with a minimal environment
  (only the Redis URL: no database URL, JWT secret or email keys), a memory cap per isolate, a CPU time limit per
  test, a fresh context per test and a 30 s watchdog.
- Submissions are queued (Redis) and acknowledged with 202; results are reduced to pass/fail for hidden tests
  before anything reaches a student.
- **Measured:** 50 simultaneous contest submissions (20% infinite loops) were all judged correctly in 31.8 s,
  about 1.6 per second with one worker. Infinite loops dominate because each runs to its time limit.
- **Limit:** a V8 isolate is a weaker boundary than a kernel sandbox (namespaces, seccomp), and the worker shares
  the host with the API on Render's free tier.

## 8. Contest freeze without leaking the board

- During the freeze students must see the board as it was, while the teacher sees it live. The server therefore
  sends only an "updated" ping over Socket.io and each screen refetches **its own** board over HTTP, so the
  freeze rule lives in one place and nothing a student receives contains frozen results.
- Ranking (ICPC: solved, then penalty minutes + 20 per wrong try on solved problems) is a pure, unit-tested
  function.

## 9. Test reliability

- **A flaky check with a clock in it:** an integration check looked for hidden-test values (41, 43, 47) in a
  response and failed whenever a timestamp had those seconds. Fixed by blanking timestamps before the search.
- **An unexplained CI failure:** unit tests failed once on `master` and passed on the identical branch run and
  every run since. It couldn't be reproduced locally (16 parallel stress runs). Instead of guessing a fix, CI now
  posts every failing unit test as a public annotation, so the next occurrence will say exactly what failed.
  **Cause still unknown.**
- **A browser test that failed only in CI:** the 2FA test passed locally (also against an empty database, as in
  CI) but failed twice on GitHub's runner. The logs weren't readable without signing in, so CI now reports
  Playwright failures as annotations too. They showed the cause at once: after "Log out", the test typed the
  email into the first box matching the placeholder "Email". On the slower runner the dashboard was still on
  screen, and its invite box (`teacher@email.com`) matches, because placeholder matching is partial and
  ignores case. Fix: wait for the login page and match exactly. A first guess (a reload after logout) was wrong;
  the guard added for it is still correct but wasn't the cause.

## 10. Dependency audit: check what actually ships

- **Found:** `npm audit` flagged DOMPurify (through Monaco) and React Router in the client, and Vite/esbuild
  in its dev tools.
- **Checked before fixing:** the flagged DOMPurify copy (in the npm Monaco package) **isn't in the built app at
  all**: the editor loads from the CDN at the version pinned in the CSP, and *that* build carries an older
  DOMPurify (3.2.7) which the audit can't see. No Monaco release ships a fixed copy yet.
- **Fixed:** React Router 6 → 7 (open-redirect advisory), Vite 5 → 7 and its React plugin (dev-server
  advisories; every 5.x and 6.x release was affected), and DOMPurify pinned to 3.4.16 with npm `overrides`.
  Versions at least two weeks old were chosen, as a precaution against freshly published packages.
  `npm audit` is now clean for the client, server and e2e packages, and all browser tests pass.
- **Still open, and documented:** the CDN copy. The CSP blocks inline scripts and event handlers, so injected
  markup can't run; serving a patched Monaco from the site would remove it.

---

## Numbers at a glance

| What | Value | Where measured |
|---|---|---|
| Live quiz, 200 players, answer p99 | 1,936 ms → 245 ms | laptop load test (API local, Atlas + Upstash remote) |
| Redis round trip to Upstash | ~69 ms | same laptop |
| Contest judge, 50 simultaneous submissions | 31.8 s, ~1.6/s | same laptop |
| Level-1 hints giving the fix away | 0/20 | 20-case evaluation, one reviewer |
| Level-2 hints giving the fix away | 17/19 → 0/8 (partial re-run) | same |
| Tests | 140 unit, 26 integration suites (425 checks), 11 browser tests | CI on every push |

None of these were measured on the hosted (free-tier) deployment.
