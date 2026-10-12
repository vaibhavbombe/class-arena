// A fake OpenRouter (OpenAI-compatible) server for the integration tests, so AI features are
// tested end to end without a real key or any cost. What it answers depends on a marker in the
// request: MOCK_FLAKY (garbage once, then a good answer), MOCK_CODE (hint with code), MOCK_DOWN (500),
// MOCK_BAD (generated MCQs with two right answers), MOCK_WRONGREF (code whose solution fails a test),
// MOCK_STATEMENT (hints that state the fix instead of asking a question).
// GET /requests lists what the API sent, so tests can check nothing secret reaches the AI.
const http = require('http')

const KEY = 'test-key'

function generated(count, type, marker) {
  return Array.from({ length: count }, (_, i) => {
    const base = { explanation: 'Because it is.', tags: ['Mock', 'generated'] }
    if (type === 'short') return { ...base, prompt: `Mock short question ${i + 1}: what is 2 + 2?`, acceptedAnswers: ['4', 'four'] }
    if (type === 'code') {
      return {
        ...base,
        prompt: `Mock double ${i + 1}\nReturn n times two.`,
        functionName: 'double',
        starterCode: 'function double(n) {\n}\n',
        referenceSolution: marker === 'MOCK_WRONGREF' ? 'function double(n) { return n < 0 ? 0 : n * 2 }' : 'function double(n) { return n * 2 }',
        sampleTests: [{ input: [2], expected: 4 }],
        hiddenTests: [{ input: [0], expected: 0 }, { input: [-3], expected: -6 }, { input: [10], expected: 20 }],
      }
    }
    const options = [{ text: 'Right answer', correct: true }, { text: 'Wrong answer', correct: marker === 'MOCK_BAD' || type === 'multi' }, { text: 'Another wrong answer', correct: false }]
    return { ...base, prompt: `Mock ${type} question ${i + 1}: pick the right answer.`, options }
  })
}

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
      if (marker === 'MOCK_FLAKY' && count % 2 === 1) return reply('Sorry, I cannot produce JSON today.')
      const generate = /exactly (\d+) \w+ question\(s\) of type "(\w+)"/.exec(text)
      if (generate) return reply(JSON.stringify({ questions: generated(Number(generate[1]), generate[2], marker) }))
      if (/short review of a student/.test(text)) {
        const accepted = /Result: Accepted/.test(text)
        return reply(JSON.stringify({
          summary: accepted ? 'Mock review: a clean solution that passes every test.' : 'Mock review: close, but some tests fail.',
          strengths: ['Mock strength: clear structure.'],
          improvements: [marker === 'MOCK_CODE' ? 'Replace it with nums.reduce((a, b) => a + b, 0)' : 'Mock improvement: check the empty list.'],
          complexity: 'Linear in the length of the list.',
        }))
      }
      if (marker === 'MOCK_CODE') return reply(JSON.stringify({ hint: 'Here you go: function solve(nums) { return nums.length }', focus: 'approach' }))
      return reply('```json\n' + JSON.stringify({ hint: marker === 'MOCK_STATEMENT' ? `Mock hint at level ${level}: add a starting value of zero.` : `Mock hint at level ${level}: what happens with an empty list?`, focus: 'edge-cases' }) + '\n```')
    })
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

module.exports = { startMockAi, KEY }
