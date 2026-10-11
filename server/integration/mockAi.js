// A fake OpenRouter (OpenAI-compatible) server for the integration tests, so AI features are
// tested end to end without a real key or any cost. What it answers depends on a marker in the
// request: MOCK_FLAKY (garbage once, then a good hint), MOCK_CODE (always code), MOCK_DOWN (500).
// GET /requests lists what the API sent, so tests can check nothing secret reaches the AI.
const http = require('http')

const KEY = 'test-key'

function startMockAi(port) {
  const requests = []
  const seen = new Map()
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === '/requests') return send(200, requests)
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return send(404, { error: 'not found' })
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'bad key' })
      const body = JSON.parse(raw)
      requests.push(body)
      const text = body.messages.map((m) => m.content).join('\n')
      const level = Number(/level (\d) of 3/.exec(text)?.[1] || 1)
      const reply = (content) => send(200, { choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } })
      const marker = /MOCK_[A-Z]+/.exec(text)?.[0]
      const count = (seen.get(marker) || 0) + 1
      seen.set(marker, count)

      if (marker === 'MOCK_DOWN') return send(500, { error: 'upstream down' })
      if (marker === 'MOCK_CODE') return reply(JSON.stringify({ hint: 'Here you go: function solve(nums) { return nums.length }', focus: 'approach' }))
      if (marker === 'MOCK_FLAKY' && count % 2 === 1) return reply('Sorry, I cannot produce JSON today.')
      return reply('```json\n' + JSON.stringify({ hint: `Mock hint at level ${level}: think about what happens with an empty list.`, focus: 'edge-cases' }) + '\n```')
    })
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

module.exports = { startMockAi, KEY }
