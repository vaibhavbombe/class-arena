const nodemailer = require('nodemailer')

// Two ways to send:
// - Brevo's HTTP API when BREVO_API_KEY is set (production). Render's free tier
//   blocks outbound SMTP, but plain HTTPS works.
// - Gmail SMTP otherwise (local development).
const SENDER_NAME = 'ClassArena'
const TIMEOUT_MS = 10000

// Dashboards make it easy to paste a stray space or quotes along with the key.
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim().replace(/^["']|["']$/g, '')

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
    throw new Error(`Brevo ${response.status}: ${await response.text()}`)
  }
}

async function sendWithGmail({ to, subject, text }) {
  await gmail.sendMail({ from: `"${SENDER_NAME}" <${process.env.GMAIL_USER}>`, to, subject, text })
}

// Returns true/false instead of throwing: a failed email shouldn't fail the request.
async function sendMail(message) {
  try {
    await (BREVO_API_KEY ? sendWithBrevo(message) : sendWithGmail(message))
    return true
  } catch (err) {
    console.error('Email failed:', err.code || err.name || '', err.message)
    return false
  }
}

module.exports = { sendMail }
