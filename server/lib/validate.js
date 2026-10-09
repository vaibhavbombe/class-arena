const { passwordProblem } = require('./password')

// Every field must be a non-empty string. Checking the type also blocks
// objects like { "$gt": "" } from reaching a Mongo query (NoSQL injection).
function missingFields(body, fields) {
  return fields.filter((field) => typeof body?.[field] !== 'string' || !body[field].trim())
}

// Sends a 400 and returns true if anything is wrong, so routes can `return`.
// Pass { newPassword: true } on routes that set a password, to apply the password rules.
function rejectInvalid(res, body, fields, { newPassword = false } = {}) {
  const missing = missingFields(body, fields)
  if (missing.length) {
    res.status(400).json({ error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required` })
    return true
  }
  const problem = newPassword && passwordProblem(body.password)
  if (problem) {
    res.status(400).json({ error: problem })
    return true
  }
  return false
}

module.exports = { rejectInvalid }
