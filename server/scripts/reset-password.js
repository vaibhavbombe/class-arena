// Operator tool: set a new password for an existing user.
// Run from the server folder:   node scripts/reset-password.js --db class-arena
// --db picks the database (production is "class-arena"); without it, the one in .env is used.
// The password is typed into a hidden prompt, so it never ends up in shell history or logs.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const readline = require('readline')
const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const User = require('../models/User')
const RefreshToken = require('../models/RefreshToken')
const { SALT_ROUNDS } = require('../routes/auth')

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    // Print the question, then swallow the echoed keystrokes.
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text)
    }
  }
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    if (hidden) process.stdout.write('\n')
    resolve(answer.trim())
  }))
}

async function main() {
  const dbFlag = process.argv.indexOf('--db')
  const dbName = dbFlag !== -1 ? process.argv[dbFlag + 1] : undefined

  await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {})
  console.log(`Connected to database "${mongoose.connection.db.databaseName}"`)

  const email = (await ask('User email: ')).toLowerCase()
  const user = await User.findOne({ email })
  if (!user) throw new Error(`No user with email ${email} in this database`)
  console.log(`Found ${user.name} (${user.role})`)

  const password = await ask('New password (8+ characters, hidden): ', { hidden: true })
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  const confirm = await ask('Type it again: ', { hidden: true })
  if (password !== confirm) throw new Error('Passwords do not match')

  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  await user.save()
  // Log the user out everywhere: anyone holding an old session must log in again.
  const { deletedCount } = await RefreshToken.deleteMany({ userId: user._id })
  console.log(`Password updated. Signed out ${deletedCount} existing session(s).`)
}

main()
  .catch((err) => {
    console.error('Failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
