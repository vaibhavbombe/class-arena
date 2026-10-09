// Checks a Brevo API key directly with Brevo, without sending any email.
// Run from the server folder:   node scripts/check-brevo-key.js
// Paste the key into the hidden prompt. It prints the account the key belongs to,
// whether a sender is verified there, and a fingerprint to compare with the
// "Email: Brevo API (key fingerprint ...)" line in the server's startup log.
const { ask } = require('./prompt')
const { fingerprint } = require('../lib/fingerprint')

async function brevo(path, key) {
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    headers: { 'api-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function main() {
  // BREVO_API_KEY in the environment (e.g. `$env:BREVO_API_KEY="..."`) skips the prompt,
  // for terminals where pasting into a hidden prompt misbehaves.
  const raw = process.env.BREVO_API_KEY || await ask('Brevo API key (hidden): ', { hidden: true })
  // Same clean-up the server does, plus terminal paste markers and invisible characters.
  const key = raw
    .replace(/\x1b\[20[01]~/g, '')
    .replace(/[^\x21-\x7e]/g, '')
    .replace(/^["']|["']$/g, '')
  console.log(`Fingerprint: ${key ? fingerprint(key) : '-'} (${key.length} chars, starts with ${key.slice(0, 8) || '-'}…)`)
  if (raw.trim() !== key) console.log('(Removed spaces, quotes or invisible characters from what was pasted.)')

  // Brevo API keys look like xkeysib-<64 hex characters>-<16 characters>, 89 in total.
  if (key.startsWith('xsmtpsib-')) {
    console.log('This is an SMTP key. Use an API key (xkeysib-...) from SMTP & API > API Keys.')
  } else if (!key.startsWith('xkeysib-')) {
    console.log('This is not a Brevo API key. API keys start with xkeysib- (SMTP & API > API Keys).')
  } else if (!/^xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}$/.test(key)) {
    console.log('The key looks incomplete or altered (a full key is usually 89 characters).')
    console.log('Copy it from the popup shown right after "Generate"; the key list only shows a shortened version.')
  }

  const account = await brevo('/account', key)
  if (account.status !== 200) {
    console.log(`Brevo rejected the key: ${account.status} ${account.body.message || ''}`)
    console.log('Generate a new key in Brevo > SMTP & API > API Keys and run this again.')
    process.exitCode = 1
    return
  }
  console.log(`Key is VALID. Account: ${account.body.email}${account.body.companyName ? ` (${account.body.companyName})` : ''}`)

  const senders = await brevo('/senders', key)
  const list = senders.body.senders || []
  console.log('Senders in this account:')
  for (const s of list) console.log(`  ${s.active ? 'active  ' : 'INACTIVE'} ${s.email}`)
  if (!list.length) console.log('  (none) Add and verify one under Senders, domains, IPs.')

  const mailFrom = await ask('MAIL_FROM you set in Render (Enter to skip): ')
  if (mailFrom) {
    const match = list.find((s) => s.email.toLowerCase() === mailFrom.toLowerCase())
    console.log(match?.active ? 'MAIL_FROM is a verified sender here.' : 'MAIL_FROM is NOT an active sender in this account.')
  }
  console.log('\nNow compare the fingerprint above with the "Email: Brevo API (key fingerprint ...)" line in the Render log.')
}

main().catch((err) => {
  console.error('Failed:', err.message)
  process.exitCode = 1
})
