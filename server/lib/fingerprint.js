const crypto = require('crypto')

// A short one-way fingerprint of a secret, safe to log: it identifies which value
// is configured without revealing it.
function fingerprint(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 8)
}

module.exports = { fingerprint }
