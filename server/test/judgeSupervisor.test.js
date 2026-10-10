const test = require('node:test')
const assert = require('node:assert/strict')
const { workerEnv } = require('../judge/supervisor')

test('the judge worker gets only the Redis connection, never app secrets', () => {
  const env = workerEnv({
    REDIS_URL: 'rediss://example', PATH: '/bin', MONGODB_URI: 'mongodb+srv://secret', JWT_ACCESS_SECRET: 'jwt',
    BREVO_API_KEY: 'xkeysib-secret', GMAIL_APP_PASSWORD: 'pw', CLIENT_URL: 'https://x', RENDER: 'true',
  })
  assert.equal(env.REDIS_URL, 'rediss://example')
  for (const secret of ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'BREVO_API_KEY', 'GMAIL_APP_PASSWORD', 'CLIENT_URL', 'RENDER']) {
    assert.equal(env[secret], undefined, `${secret} leaked into the worker`)
  }
  assert.ok(env.REDIS_PREFIX)
})
