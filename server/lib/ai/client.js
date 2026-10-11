const { fingerprint } = require('../fingerprint')

// The only place the server talks to the AI provider (OpenRouter, OpenAI-compatible API).
// Callers get { ok: true, data } with JSON that passed their validator, or { ok: false, reason }
// and use their own fallback. Bad output (not JSON, wrong shape, unsafe) and temporary errors
// are retried; the API key never leaves the server and is never logged.

const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5'
const RETRYABLE = new Set(['timeout', 'network', 'invalid_json', 'invalid_output', 'http_429', 'http_500', 'http_502', 'http_503', 'http_504'])

function aiConfig(env = process.env) {
  const key = env.OPENROUTER_API_KEY || ''
  return {
    enabled: Boolean(key) && env.AI_DISABLED !== 'true',
    key,
    model: env.AI_MODEL || DEFAULT_MODEL,
    baseUrl: (env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  }
}

function describeConfig(config = aiConfig()) {
  if (!config.enabled) return 'AI: off (OPENROUTER_API_KEY not set or AI_DISABLED=true); fallback hints only'
  return `AI: ${config.model} via ${new URL(config.baseUrl).host} (key fingerprint ${fingerprint(config.key)})`
}

// Models sometimes wrap JSON in ```json fences or add a sentence; take the outermost object.
function extractJson(text) {
  if (typeof text !== 'string') return undefined
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callOnce({ config, messages, maxTokens, temperature, timeoutMs, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'X-Title': 'ClassArena',
        ...(process.env.CLIENT_URL ? { 'HTTP-Referer': process.env.CLIENT_URL } : {}),
      },
      body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens, temperature }),
    })
    if (!response.ok) return { reason: `http_${response.status}` }
    const body = await response.json().catch(() => null)
    return { text: body?.choices?.[0]?.message?.content, usage: body?.usage }
  } catch (err) {
    return { reason: err.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param messages   chat messages ({ role, content })
 * @param validate   (data) => error string or null; covers the schema and any safety checks
 */
async function chatJSON({ messages, validate, maxTokens = 400, temperature = 0.3, attempts = 2, timeoutMs = 20000, fetchImpl = fetch, config = aiConfig(), retryDelayMs = 500 }) {
  if (!config.enabled) return { ok: false, reason: 'disabled', attempts: 0 }
  let reason = 'unknown'
  let used = 0
  for (let attempt = 1; attempt <= attempts; attempt++) {
    used = attempt
    const result = await callOnce({ config, messages, maxTokens, temperature, timeoutMs, fetchImpl })
    if (result.reason) {
      reason = result.reason
    } else {
      const data = extractJson(result.text)
      if (data === undefined) reason = 'invalid_json'
      else {
        const error = validate(data)
        if (!error) return { ok: true, data, attempts: attempt, model: config.model, usage: result.usage }
        reason = 'invalid_output'
      }
    }
    if (!RETRYABLE.has(reason)) break
    if (attempt < attempts) await sleep(retryDelayMs * attempt)
  }
  console.warn(`AI call failed: ${reason}`) // the reason code only: no prompt, output or key
  return { ok: false, reason, attempts: used }
}

module.exports = { aiConfig, describeConfig, chatJSON, extractJson, DEFAULT_MODEL }
