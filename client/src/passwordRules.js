// Mirrors server/lib/password.js so people see what's missing while typing.
// The server enforces the rules; this list is only for the checklist.
export const PASSWORD_RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'number', test: (p) => /[0-9]/.test(p) },
  { label: 'special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
  { label: 'at most 72 characters', test: (p) => new TextEncoder().encode(p).length <= 72 },
]

export function passwordIsValid(password) {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
