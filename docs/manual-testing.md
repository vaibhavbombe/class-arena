# Manual testing guide

Test everything yourself on the live site, step by step. Each step says what to do and **what you should
see** (→). Tick the boxes as you go.

## 0. Setup

- Site: **https://class-arena-vsb10.vercel.app**. The API sleeps when idle on Render's free tier: the first
  request after a while can take **~50 seconds**. Wait once, then everything is fast.
- **Two windows side by side:** a normal Chrome window (**teacher**) and an **Incognito** window
  (Ctrl+Shift+N, the **student**). They don't share logins, so you can be both at once. A phone works as a
  second student too.
- **Use your own new institute** for anything that creates or changes data (sections 1–9). The demo accounts
  (section 10) are shared with other visitors, so use them mainly to look around.
- For emails (invites, password reset), use two addresses you can open, e.g. your Gmail and a second one.
  Invites can land in **spam**.
- Password rules: 8+ characters with upper and lower case, a number and a symbol, e.g. `Test-Pass1!`.

---

## 1. Accounts and login

- [ ] **Sign up an institute.** Login page → "Run an institute? Create one" → institute name, your name, email,
  password → you land on the dashboard as **admin**.
- [ ] **Password rules.** Try `password` at signup → the checklist shows what's missing and the server refuses it.
- [ ] **Invite a teacher.** Admin → members section → enter your second email → **Invite** → you get the invite
  email (or the link on screen if sending failed). Open the link in the **Incognito** window → set name and
  password → you land on the dashboard as **teacher**.
- [ ] **Wrong password.** Log out, log in with a wrong password → "Invalid email or password".
- [ ] **Stay logged in after reload.** Log in → press F5 → still logged in.
- [ ] **Tokens aren't readable (optional).** F12 → Application → Local Storage → only `sessionUser`, no tokens.
  Application → Cookies → `ca_rt` with ✓ HttpOnly, Strict, path `/api/auth`.
- [ ] **Forgot password.** Login → "Forgot password?" → your email → open the email link → set a new password →
  log in with it. The old password no longer works.
- [ ] **Log out.** → back to the login page; the `ca_rt` cookie is gone.
- [ ] **Rate limit (optional, locks that account for 15 minutes!).** Use a throwaway account: 10 wrong passwords →
  the 11th attempt says "Too many failed logins… try again in 15 minutes".

## 2. Classes and students

- [ ] **Teacher creates a class** (e.g. "Physics 101") → a 6-character **join code** appears.
- [ ] **Student signs up with the code.** Incognito: log out → "Student? Join with a class code" → name, email,
  password, code → dashboard shows the class.
- [ ] **Wrong code** at signup → "No class found with that code".
- [ ] **Teacher sees the student** in the class roster. **Remove** a student → they no longer see the class.
- [ ] **Student can't open teacher pages:** as student, go to `/questions` → "The question bank is for teachers
  and admins".

## 3. Question bank (teacher)

- [ ] **Multiple choice:** Question bank → + New question → 3–4 options, tick one correct → save → it's listed.
- [ ] **Multi-select:** tick two correct options → save.
- [ ] **Short answer:** accepted answers e.g. `H2O`, `water` → save.
- [ ] **Coding question:** function name `add`, a sample test `[2, 3]` → `5`, hidden tests `[-1, 1]` → `0` and
  `[100, 23]` → `123`, reference solution `function add(a, b) { return a + b }` → **Check with judge** →
  all tests pass → save.
- [ ] **Search and filters** by type and tag work.
- [ ] **AI generator:** ✨ Generate with AI → topic, type, how many → **Generate drafts** → draft cards appear →
  **Review & save** opens the editor → save → it's in the bank. *(If it says the AI couldn't write questions,
  the free AI allowance may be used up for today: that's expected, try later.)*

## 4. Timed test

- [ ] **Teacher builds a test:** class page → + New test → title, duration (e.g. 10 minutes) → add the questions
  from section 3 with points → **Publish**.
- [ ] **Student takes it** (Incognito): class → the test → **Start test** → confirm → a countdown runs.
- [ ] **Autosave:** answer two questions → press **F5** → your answers are still there and the timer continued.
- [ ] **Coding question in the test:** write `add` → **Run samples** (checked in your browser) → continue.
- [ ] **Submit** → confirm → "Submitted …"; you can't change answers anymore.
- [ ] **Teacher results:** the test → results → the student's score, statistics, % correct per question, the
  student's answers. The coding answer shows "grading" for a moment, then points per hidden test passed.
- [ ] **Release results** → the student now sees the review with correct answers and explanations.
- [ ] **Export CSV** downloads a file with scores.
- [ ] **Time limit:** make a 1-minute test, start it as student, wait → it's submitted automatically.

## 5. Live quiz (two windows)

- [ ] **Teacher:** class page → + New live quiz → add 2–3 multiple-choice questions (e.g. 20 seconds each) →
  **▶ Start game** → the host screen shows a **6-digit PIN** and an empty lobby.
- [ ] **Student** (Incognito or phone): "Join a live game" (or `/play`) → enter the PIN → "You're in!", and the
  student's name appears **instantly** on the teacher's screen.
- [ ] **Wrong PIN** → "No game found with that PIN".
- [ ] **Teacher: Start** → the question appears on both screens with a countdown.
- [ ] **Student answers** → "Answer locked in!" → the teacher's answer chart updates live.
- [ ] **Reveal:** when everyone answered (or time ran out) → student sees **Correct / Incorrect** and points;
  answering faster gives more points (up to 1000).
- [ ] **Next** through all questions → **Show podium** → the student sees their place ("1st place").
- [ ] **Refresh during a game** (student, F5) → you're back in the game.

## 6. Coding practice

- [ ] **Teacher:** class page → coding practice → + Add coding problem → pick the `add` question.
- [ ] **Student:** open it → the Monaco editor loads → write `return a + b` → **▶ Run samples** →
  "Run: 1 of 1 tests passed".
- [ ] **Submit** → "Judging…" → **Accepted**, with hidden tests shown only as pass/fail (no inputs).
- [ ] **Wrong answer:** `return a - b` → Submit → **Wrong Answer**, with sample details.
- [ ] **Infinite loop:** `while (true) {}` → Submit → **Time Limit Exceeded** (the site stays responsive).
- [ ] **Too fast:** two Submits within 5 seconds → "Please wait a few seconds between submissions".
- [ ] **Hints:** 💡 Get hint 1 → a question about your code; wait 10 s → hint 2 says *where* the problem is; hint
  3 describes the change in words. None contains code. *(If a hint says "standard hint", the AI was busy or the
  free allowance ran out: expected.)*
- [ ] **Feedback:** on a judged submission → 🧠 Get feedback on this code → summary, what's good, what to improve.
- [ ] **Teacher view:** the problem's Students table shows status, attempts, **hints used**; "View latest code"
  shows the student's code and feedback.

## 7. Coding contest (two windows)

- [ ] **Teacher:** class page → + New contest → title → add 1–2 coding questions → duration **10 minutes**,
  freeze **5 minutes** → **▶ Start now**.
- [ ] **Student** sees the contest as Live → **Enter** → problems A, B … appear (they're hidden before the start).
- [ ] **Student submits** a wrong then a right answer → the **leaderboard updates on the teacher's screen without
  refreshing**: ✓ with the minute, "+1" for the wrong try; the first solver gets ⭐.
- [ ] **Freeze** (last 5 minutes): new submissions show as **"?"** for the student, while the teacher still sees the
  real result.
- [ ] **End** (after 10 minutes): the board unfreezes for everyone; submitting is refused ("The contest has ended").

## 8. Analytics (teacher)

- [ ] Class page → 📊 Analytics → class average, participation, a chart per test, weakest topics (by tag),
  hardest questions, and each student with a "needs attention" flag if their average is under 50%.

## 9. Look and feel

- [ ] **Dark/light mode** toggle in the header → the whole app switches, and it's remembered after a reload.
- [ ] **Phone:** open the site on your phone (or F12 → device toolbar) → pages fit the screen without sideways
  scrolling; the live quiz is comfortable to play.

## 10. Demo accounts (look around quickly)

Password for all: `Demo-Arena1!`

- [ ] **Teacher** `demo-teacher@example.com` → class "JavaScript Foundations" → analytics with real data, two
  released quizzes, the "Friday Cup" contest leaderboard, practice problems with student hints and feedback.
- [ ] **Student** `demo-student1@example.com` … `demo-student8@example.com` → see results, solve problems.
- Other visitors can change this data, so don't worry if it differs from before.

## 11. Security spot checks (optional, F12 → Network tab)

- [ ] **No answers sent to students:** as a student, start a test → click the request ending in `/attempt` →
  Response → the questions have **no** `correct` fields.
- [ ] **No hidden tests sent to students:** open a practice problem → the response shows sample tests and a
  hidden-test **count**, but no hidden inputs.
- [ ] **Other institutes are invisible:** copy a test URL from your institute, open it while logged in as a demo
  student → "not found".
- [ ] **Security headers:** Network → the main document request → Response headers include
  `Content-Security-Policy`.

## 12. Two-factor login (2FA)

You need an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…). Use
**your own** account, not a demo account: turning 2FA on for a demo account would lock other visitors out.

- [ ] **Turn it on.** Header → **Security** → enter your password → **Set up two-factor login** → a QR code
  appears. Scan it with the app (or type in the key shown under it) → enter the 6-digit code → **Turn on**.
- [ ] **Recovery codes.** 10 codes appear once → **Download** (or **Copy**) and keep the file → **I've saved
  them** → the page shows "On since …" and "10 of 10 recovery codes left".
- [ ] **Badge.** As an admin, the members list shows **2FA** next to that person's name.
- [ ] **Login asks for a code.** Log out → log in with email and password → the page says **Enter your code**
  (you are not logged in yet). Type `000000` → "That code isn't right". Type the code from the app → dashboard.
- [ ] **A code works once.** Log out and log in again within the same 30 seconds with the **same** code → refused.
  Wait for the next code → it works.
- [ ] **Recovery code.** Log out → password → enter one of the recovery codes instead → dashboard. Security page
  → "9 of 10 recovery codes left". The same recovery code a second time → refused.
- [ ] **The code step expires.** Enter the password, wait more than 5 minutes, then enter a code → "The login
  step expired. Please log in again." and you're back at the password.
- [ ] **New recovery codes.** Security → **New recovery codes** → enter a code from the app → 10 new codes; an old
  one no longer works.
- [ ] **Turn it off.** Security → **Turn off** → password + a code → "Two-factor login is off". The next login
  asks only for the password.
- [ ] **Require it for staff (admin).** Admin with 2FA on → Security → tick **Require two-factor login for staff**
  → it says how many staff still need to set it up. (An admin without 2FA sees the box disabled.)
- [ ] **A teacher without 2FA is held on the Security page.** Log in as that teacher (password only) → you land
  on **Security** with "Your institute requires two-factor login…"; clicking **Classes** brings you back. Set it up
  → after **I've saved them** you reach the dashboard. The **Turn off** button is gone ("Required by your
  institute"). Students log in as before.
- [ ] **Switch the policy off** again as the admin → the teacher can turn 2FA off.
- [ ] **Not readable from the network (optional, F12 → Network).** After the password, the `login` response has
  `mfaRequired` and an `mfaToken` but **no** `accessToken`, and Application → Cookies has **no** `ca_rt` yet.

---

**If something looks wrong:** note the page, what you clicked, and what you saw (a screenshot helps). If the
whole site seems stuck, open https://class-arena-server.onrender.com/api/health: it should show `"ok":true`
(the first call may take ~50 seconds to wake the server).
