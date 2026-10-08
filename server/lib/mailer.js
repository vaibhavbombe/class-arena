const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  // Nodemailer's defaults wait up to 2 minutes. Some hosts (e.g. Render's free tier)
  // block SMTP, so fail fast and let the admin share the invite link by hand.
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
})

// Returns true/false instead of throwing: a failed email shouldn't fail the request.
async function sendMail({ to, subject, text }) {
  try {
    await transporter.sendMail({ from: `"ClassArena" <${process.env.GMAIL_USER}>`, to, subject, text })
    return true
  } catch (err) {
    console.error('Email failed:', err.code || '', err.message)
    return false
  }
}

module.exports = { sendMail }
