// Every field must be a non-empty string. Checking the type also blocks
// objects like { "$gt": "" } from reaching a Mongo query (NoSQL injection).
function missingFields(body, fields) {
  return fields.filter((field) => typeof body?.[field] !== 'string' || !body[field].trim())
}

// Sends a 400 and returns true if anything is wrong, so routes can `return`.
function rejectInvalid(res, body, fields) {
  const missing = missingFields(body, fields)
  if (missing.length) {
    res.status(400).json({ error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required` })
    return true
  }
  if (fields.includes('password') && body.password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return true
  }
  return false
}

module.exports = { rejectInvalid }
