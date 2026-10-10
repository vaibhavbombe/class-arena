// Deep equality for JSON values: object key order doesn't matter, array order does,
// and numbers are compared with a small tolerance (so 0.1 + 0.2 equals 0.3).
const EPSILON = 1e-9

function deepEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b)
    return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b))
  }
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((value, i) => deepEqual(value, b[i]))
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
}

module.exports = { deepEqual }
