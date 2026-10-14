import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import api from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import { errorMessage } from '../session.js'
import useMe from '../useMe.js'
import { can } from '../permissions.js'
import { buttonStyle, cardStyle, colors, dangerButtonStyle, formStyle, ghostButtonStyle, inputStyle, messageStyle, sectionTitleStyle, titleStyle, widePageStyle } from '../styles.js'

const codeInputProps = { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 11, style: { ...inputStyle, letterSpacing: '0.2em' } }

// Recovery codes are shown once, right after they're made: only their hashes are kept on the
// server, so this is the only chance to save them.
// Admins: require two-factor login for all staff (admins and teachers). Students are never affected.
function StaffPolicy({ me, ownMfaOn }) {
  const [required, setRequired] = useState(Boolean(me.institution.requireStaffMfa))
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  async function toggle(event) {
    const value = event.target.checked
    setRequired(value) // show the click at once; put it back if the server refuses
    setBusy(true)
    setNote(null)
    try {
      const { data } = await api.put('/api/institute/security', { requireStaffMfa: value })
      setRequired(data.requireStaffMfa)
      setNote({ ok: true, text: data.requireStaffMfa
        ? (data.staffWithoutMfa ? `On. ${data.staffWithoutMfa} staff member(s) without two-factor login will be asked to set it up before they can continue.` : 'On. All staff already use two-factor login.')
        : 'Off. Staff can choose for themselves.' })
    } catch (error) {
      setRequired(!value)
      setNote({ ok: false, text: errorMessage(error, 'Could not change the policy.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 style={sectionTitleStyle}>Institute policy</h2>
      <div style={cardStyle}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontWeight: 700 }}>
          <input type="checkbox" checked={required} onChange={toggle} disabled={busy || (!required && !ownMfaOn)} />
          <span>Require two-factor login for staff (admins and teachers)</span>
        </label>
        <p style={{ color: colors.muted, fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          {!required && !ownMfaOn
            ? 'Turn on two-factor login for your own account first, so this can never lock you out.'
            : 'Staff without it can log in, but can only use the Security page until they set it up. Students are not affected.'}
        </p>
        {note && <p role={note.ok ? 'status' : 'alert'} style={messageStyle(note.ok)}>{note.text}</p>}
      </div>
    </>
  )
}

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')

  function download() {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`ClassArena recovery codes (each works once)\n\n${text}\n`], { type: 'text/plain' }))
    link.download = 'classarena-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div style={{ ...cardStyle, marginTop: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem' }}>Save your recovery codes</h3>
      <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
        If you lose your phone, each of these logs you in once. They won't be shown again.
      </p>
      <ul aria-label="Recovery codes" style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.3rem', fontFamily: 'monospace', fontSize: '1rem' }}>
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))} style={ghostButtonStyle}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" onClick={download} style={ghostButtonStyle}>Download</button>
        <button type="button" onClick={onDone} style={buttonStyle}>I've saved them</button>
      </div>
    </div>
  )
}

export default function Security() {
  const me = useMe()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [setup, setSetup] = useState(null) // { secret, otpauthUrl, qr } while turning it on
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [form, setForm] = useState({ password: '', code: '' })
  const [action, setAction] = useState(null) // 'disable' | 'regenerate' while that form is open
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/auth/mfa').then((response) => setStatus(response.data)).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  const field = (name) => ({ name, value: form[name], onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })) })

  async function send(request, onSuccess) {
    setBusy(true)
    setMessage(null)
    try {
      await onSuccess((await request()).data)
      setForm({ password: '', code: '' })
    } catch (error) {
      setMessage({ ok: false, text: errorMessage(error, 'Something went wrong. Please try again.') })
    } finally {
      setBusy(false)
    }
  }

  const startSetup = (event) => {
    event.preventDefault()
    send(() => api.post('/api/auth/mfa/setup', { password: form.password }), async (data) => {
      // The QR code is drawn in the browser; the secret never goes to a third-party QR service.
      setSetup({ ...data, qr: await QRCode.toDataURL(data.otpauthUrl, { width: 200, margin: 1 }) })
    })
  }
  const enable = (event) => {
    event.preventDefault()
    send(() => api.post('/api/auth/mfa/enable', { code: form.code.trim() }), (data) => {
      setSetup(null)
      setRecoveryCodes(data.recoveryCodes)
      setMessage({ ok: true, text: 'Two-factor login is on. From now on you will be asked for a code when you log in.' })
      return load()
    })
  }
  const disable = (event) => {
    event.preventDefault()
    send(() => api.post('/api/auth/mfa/disable', { password: form.password, code: form.code.trim() }), () => {
      setAction(null)
      setMessage({ ok: true, text: 'Two-factor login is off.' })
      return load()
    })
  }
  const regenerate = (event) => {
    event.preventDefault()
    send(() => api.post('/api/auth/mfa/recovery-codes', { code: form.code.trim() }), (data) => {
      setAction(null)
      setRecoveryCodes(data.recoveryCodes)
      return load()
    })
  }
  const openAction = (name) => {
    setAction(name)
    setMessage(null)
    setForm({ password: '', code: '' })
  }

  if (!me) return null
  // Under the institute policy, staff can't turn it off (the server refuses too).
  const lockedOn = me.institution.requireStaffMfa && me.user.role !== 'student'
  // Once a required setup is done (codes saved), the rest of the app opens up.
  const finishCodes = () => (me.mfaSetupRequired ? navigate('/dashboard') : setRecoveryCodes(null))

  return (
    <main style={widePageStyle}>
      <AppHeader me={me} />
      <div style={{ maxWidth: '560px' }}>
      <h1 style={titleStyle}>Security</h1>
      <h2 style={sectionTitleStyle}>Two-factor login</h2>
      <p style={{ color: colors.muted, fontSize: '0.9rem' }}>
        After your password, log in with a 6-digit code from an authenticator app (Google Authenticator,
        Microsoft Authenticator, 1Password…). A stolen password alone is then not enough.
      </p>
      {me.mfaSetupRequired && !recoveryCodes && (
        <p role="alert" style={messageStyle(false)}>Your institute requires two-factor login for staff. Set it up below to continue using ClassArena.</p>
      )}

      {!status ? null : !status.available ? (
        <p style={messageStyle(false)}>Two-factor login is not available on this server yet.</p>
      ) : recoveryCodes ? (
        <RecoveryCodes codes={recoveryCodes} onDone={finishCodes} />
      ) : status.enabled ? (
        <div style={cardStyle}>
          <p style={{ margin: 0, fontWeight: 700, color: colors.success }}>✓ On since {new Date(status.enabledAt).toLocaleDateString()}</p>
          <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
            {status.recoveryCodesLeft} of 10 recovery codes left.{lockedOn ? ' Required by your institute, so it stays on.' : ''}
          </p>
          {!action && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => openAction('regenerate')} style={ghostButtonStyle}>New recovery codes</button>
              {!lockedOn && <button onClick={() => openAction('disable')} style={dangerButtonStyle}>Turn off</button>}
            </div>
          )}
          {action === 'regenerate' && (
            <form onSubmit={regenerate} style={formStyle}>
              <label style={{ fontSize: '0.85rem' }}>The old codes stop working. Enter a code from your app:</label>
              <input {...field('code')} placeholder="123456" required aria-label="Code from your app" {...codeInputProps} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={busy} style={buttonStyle}>Make new codes</button>
                <button type="button" onClick={() => setAction(null)} style={ghostButtonStyle}>Cancel</button>
              </div>
            </form>
          )}
          {action === 'disable' && (
            <form onSubmit={disable} style={formStyle}>
              <input {...field('password')} type="password" placeholder="Your password" required autoComplete="current-password" style={inputStyle} />
              <input {...field('code')} placeholder="Code from your app, or a recovery code" required aria-label="Code from your app or a recovery code" {...codeInputProps} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={busy} style={{ ...buttonStyle, background: colors.danger }}>Turn off two-factor login</button>
                <button type="button" onClick={() => setAction(null)} style={ghostButtonStyle}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      ) : setup ? (
        <div style={cardStyle}>
          <p style={{ margin: 0, fontWeight: 700 }}>1. Scan this with your authenticator app</p>
          <img src={setup.qr} alt="QR code for your authenticator app" width="200" height="200" style={{ display: 'block', margin: '0.75rem 0', background: '#FFFFFF', borderRadius: '8px' }} />
          <p style={{ fontSize: '0.85rem', color: colors.muted }}>
            Can't scan? Enter this key in the app instead:{' '}
            <code data-testid="mfa-secret" style={{ fontWeight: 700, color: colors.primary, wordBreak: 'break-all' }}>{setup.secret.match(/.{1,4}/g).join(' ')}</code>
          </p>
          <form onSubmit={enable} style={formStyle}>
            <label htmlFor="mfa-first-code" style={{ fontWeight: 700 }}>2. Enter the 6-digit code the app shows</label>
            <input id="mfa-first-code" {...field('code')} placeholder="123456" required {...codeInputProps} maxLength={6} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={busy} style={buttonStyle}>Turn on</button>
              <button type="button" onClick={() => setSetup(null)} style={ghostButtonStyle}>Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={startSetup} style={{ ...cardStyle, ...formStyle }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Two-factor login is off.</p>
          <input {...field('password')} type="password" placeholder="Confirm your password" required autoComplete="current-password" style={inputStyle} />
          <button type="submit" disabled={busy} style={buttonStyle}>Set up two-factor login</button>
        </form>
      )}
      {message && <p role={message.ok ? 'status' : 'alert'} style={messageStyle(message.ok)}>{message.text}</p>}
      {status?.available && can(me, 'security.manage') && <StaffPolicy me={me} ownMfaOn={status.enabled} />}
      </div>
    </main>
  )
}
