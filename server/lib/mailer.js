const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
})

// Returns true/false instead of throwing: a failed email shouldn't fail the request.
async function sendMail({ to, subject, text }) {
  try {
    await transporter.sendMail({ from: `"ClassArena" <${process.env.GMAIL_USER}>`, to, subject, text })
    return true
  } catch (err) {
    console.error('Email failed:', err.message)
    return false
  }
}

module.exports = { sendMail }
