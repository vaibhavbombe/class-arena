const nodemailer = require('nodemailer')
const { fingerprint } = require('./fingerprint')

// Two ways to send:
// - Brevo's HTTP API when BREVO_API_KEY is set (production). Render's free tier
//   blocks outbound SMTP, but plain HTTPS works.
// - Gmail SMTP otherwise (local development).
const SENDER_NAME = 'ClassArena'
const TIMEOUT_MS = 10000

// Dashboards make it easy to paste a stray space or quotes along with the key.
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim().replace(/^["']|["']$/g, '')

// The fingerprint is one-way, so it's safe to log. scripts/check-brevo-key.js prints
// the same fingerprint, so you can tell whether the server has the key you tested.
if (BREVO_API_KEY) {
  console.log(`Email: Brevo API (key fingerprint ${fingerprint(BREVO_API_KEY)}, ${BREVO_API_KEY.length} chars)`)
} else {
  console.log('Email: Gmail SMTP (BREVO_API_KEY not set)')
}

// Brevo shows two kinds of key on the same page; only the API key works here.
// The prefix isn't secret, so it's safe to name in the log.
if (BREVO_API_KEY.startsWith('xsmtpsib-')) {
  console.warn('BREVO_API_KEY is an SMTP key (xsmtpsib-...). Use an API key (xkeysib-...) from Brevo > SMTP & API > API Keys.')
} else if (BREVO_API_KEY && !BREVO_API_KEY.startsWith('xkeysib-')) {
  console.warn('BREVO_API_KEY does not look like a Brevo API key (expected it to start with xkeysib-).')
}

const gmail = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  // Nodemailer's defaults wait up to 2 minutes; fail fast instead.
  connectionTimeout: TIMEOUT_MS,
  greetingTimeout: TIMEOUT_MS,
  socketTimeout: 15000,
})

async function sendWithBrevo({ to, subject, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY,'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      // Must be a sender verified in the Brevo dashboard.
      sender: { name: SENDER_NAME, email: (process.env.MAIL_FROM || process.env.GMAIL_USER || '').trim() },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    // Brevo's error body says what's wrong (bad key, unverified sender) and has no secrets.
    const body = await response.text()
    const err = new Error(`Brevo ${response.status}: ${body}`)
    err.reason = brevoReason(response.status, body)
    throw err
  }
}

// Short, admin-facing explanations. The full provider response stays in the server log.
function brevoReason(status, body) {
  const text = body.toLowerCase()
  if (status === 401 && text.includes('ip')) return "The email service blocked this server's IP address (Brevo > Security > Authorised IPs)."
  if (status === 401) return 'The email service rejected the API key. Check BREVO_API_KEY (it starts with xkeysib-).'
  if (status === 400 && text.includes('sender')) return 'The sender address (MAIL_FROM) is not verified in Brevo.'
  if (status === 403) return 'The Brevo account is not allowed to send yet (it may still be under review).'
  if (status === 429) return 'The daily email limit has been reached.'
  return `The email service returned an error (${status}).`
}

function smtpReason(err) {
  if (err.code === 'EAUTH') return 'The email login was rejected (check the Gmail app password).'
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ECONNECTION'].includes(err.code)) {
    return 'Could not reach the email server. This host may block outgoing email; set BREVO_API_KEY.'
  }
  return 'The email server returned an error.'
}

async function sendWithGmail({ to, subject, text }) {
  await gmail.sendMail({ from: `"${SENDER_NAME}" <${process.env.GMAIL_USER}>`, to, subject, text })
}

// Returns { sent, reason } instead of throwing: a failed email shouldn't fail the request.
async function sendMail(message) {
  try {
    await (BREVO_API_KEY ? sendWithBrevo(message) : sendWithGmail(message))
    return { sent: true }
  } catch (err) {
    console.error('Email failed:', err.code || err.name || '', err.message)
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { sent: false, reason: 'The email service did not respond in time.' }
    }
    return { sent: false, reason: err.reason || smtpReason(err) }
  }
}

module.exports = { sendMail }
