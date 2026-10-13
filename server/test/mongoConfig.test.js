const test = require('node:test')
const assert = require('node:assert/strict')
const connectMongo = require('../config/mongo')

test('credentials in a connection string are masked', () => {
  const { redactCredentials } = connectMongo
  assert.equal(redactCredentials('mongodb+srv://admin:S3cret%21@cluster0.abc.mongodb.net/db'), 'mongodb+srv://***@cluster0.abc.mongodb.net/db')
  assert.equal(redactCredentials('failed for mongodb://u:p@10.0.0.1:27017 and mongodb://x:y@host'), 'failed for mongodb://***@10.0.0.1:27017 and mongodb://***@host')
  assert.equal(redactCredentials('getaddrinfo ENOTFOUND cluster0.abc.mongodb.net'), 'getaddrinfo ENOTFOUND cluster0.abc.mongodb.net')
})

test('a failed connection reports the error without the password', async () => {
  const saved = process.env.MONGODB_URI
  // An invalid scheme fails straight away without any network access.
  process.env.MONGODB_URI = 'notmongo://someone:VerySecretPassword@localhost/db'
  try {
    await assert.rejects(connectMongo(), (err) => {
      assert.match(err.message, /^MongoDB connection failed/)
      assert.ok(!err.message.includes('VerySecretPassword'))
      return true
    })
  } finally {
    process.env.MONGODB_URI = saved
  }
})
