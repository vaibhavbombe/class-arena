// Password rules: enforced wherever a password is set, not on login.
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const User = require('../models/User')
const { run, call, check, connectTestDb, finish } = require('./helpers')

;(async () => {
  await connectTestDb()
  const signup = (password, n) => call('POST', '/api/auth/signup', { institutionName: 'Rules', name: 'R', email: `rules${n}${run}@example.com`, password })
  const cases = [
    ['password123', 'an uppercase letter, a special character'],
    ['PASSWORD123!', 'a lowercase letter'],
    ['Password!', 'a number'],
    ['Pa1!', 'at least 8 characters'],
    ['Aa1!' + 'x'.repeat(70), 'at most 72 characters'],
  ]
  for (const [i, [pw, expected]] of cases.entries()) {
    const r = await signup(pw, i)
    check(`signup rejects "${pw.length > 20 ? pw.slice(0, 12) + '…(74 chars)' : pw}" -> needs ${expected}`, r.s === 400 && r.d.error === `Password needs ${expected}`, r.d)
  }
  const good = await signup('Passw0rd!x', 'ok')
  check('signup accepts Passw0rd!x', good.s === 201, good.d)

  const inv = await call('POST', '/api/invites', { email: `rt${run}@example.com` }, good.d.accessToken)
  const tok = new URL(inv.d.inviteUrl).searchParams.get('token')
  const weakAccept = await call('POST', '/api/invites/accept', { token: tok, name: 'T', password: 'weakpassword' })
  check('invite accept enforces rules', weakAccept.s === 400 && weakAccept.d.error.startsWith('Password needs'), weakAccept.d)
  const okAccept = await call('POST', '/api/invites/accept', { token: tok, name: 'T', password: 'Teach3r!pass' })
  check('invite still usable after a rejected weak password', okAccept.s === 201, okAccept.d)

  const cls = await call('POST', '/api/classes', { name: 'C' }, okAccept.d.accessToken)
  const weakStudent = await call('POST', '/api/auth/student-signup', { name: 'S', email: `rs${run}@example.com`, password: 'weakpassword', joinCode: cls.d.joinCode })
  check('student signup enforces rules', weakStudent.s === 400 && weakStudent.d.error.startsWith('Password needs'), weakStudent.d)

  // An account created before the rules (old-style password) must still be able to log in.
  const legacy = `legacy${run}@example.com`
  await User.create({ email: legacy, passwordHash: await bcrypt.hash('password123', 10), name: 'Legacy', institutionId: new mongoose.Types.ObjectId(), role: 'admin' })
  const legacyLogin = await call('POST', '/api/auth/login', { email: legacy, password: 'password123' })
  check('existing account with old-style password can still log in', legacyLogin.s === 200, legacyLogin.d)
  await User.deleteOne({ email: legacy })

  await finish()
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
