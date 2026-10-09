// Rules for a NEW password (signup, invite, reset). Login doesn't apply them, so
// accounts created before a rule existed can still sign in.
// client/src/passwordRules.js mirrors this list for the live checklist; the server is
// the one that enforces it, since anyone can call the API directly.
const RULES = [
  { label: 'at least 8 characters', test: (p) => p.length >= 8 },
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently cut.
  { label: 'at most 72 characters', test: (p) => Buffer.byteLength(p) <= 72 },
  { label: 'an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'a number', test: (p) => /[0-9]/.test(p) },
  { label: 'a special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

// Returns null if the password is acceptable, otherwise a message listing what's missing.
function passwordProblem(password) {
  const failed = RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label)
  return failed.length ? `Password needs ${failed.join(', ')}` : null
}

module.exports = { passwordProblem }
