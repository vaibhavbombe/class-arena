const crypto = require('crypto')

// No 0/O or 1/I/L, so codes read aloud or written on a board aren't misread.
// 31 characters ^ 6 = ~887 million codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 6

function generateJoinCode() {
  let code = ''
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return code
}

// Accepts "abc-234", " ABC 234 " etc. Returns null for anything that can't be a code.
function normalizeJoinCode(input) {
  if (typeof input !== 'string') return null
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return code.length === LENGTH ? code : null
}

// Runs `save(code)` with fresh codes until one doesn't hit the unique index.
async function withUniqueJoinCode(save) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await save(generateJoinCode())
    } catch (err) {
      if (err.code !== 11000 || !err.keyPattern?.joinCode) throw err
    }
  }
  throw new Error('Could not generate a unique join code')
}

module.exports = { normalizeJoinCode, withUniqueJoinCode }
