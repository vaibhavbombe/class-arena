import { useEffect, useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cellStyle, colors, ghostButtonStyle, inlineFormStyle, inputStyle, messageStyle, sectionTitleStyle } from '../styles.js'

// Admin only: everyone in the institute, plus the teacher invite form.
export default function MembersPanel() {
  const [members, setMembers] = useState([])
  const [roleFilter, setRoleFilter] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('teacher')
  const [inviteMsg, setInviteMsg] = useState(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.get('/api/members', { params: roleFilter ? { role: roleFilter } : {} })
      .then((response) => setMembers(response.data))
      .catch(() => setMembers([]))
  }, [roleFilter])

  async function handleInvite(event) {
    event.preventDefault()
    setInviteMsg(null)
    setSending(true)
    try {
      const response = await api.post('/api/invites', { email: inviteEmail, role: inviteRole })
      setInviteMsg({ ok: response.data.emailSent, text: response.data.message, reason: response.data.emailError, link: response.data.inviteUrl })
      setInviteEmail('')
    } catch (requestError) {
      setInviteMsg({ ok: false, text: errorMessage(requestError, 'Could not send invite.') })
    } finally {
      setSending(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteMsg.link)
      setInviteMsg((current) => ({ ...current, copied: true }))
    } catch {
      // Clipboard can be blocked; the link is still shown for manual copying.
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h2 style={sectionTitleStyle}>Members</h2>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={inputStyle} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="teacher">Teachers</option>
          <option value="student">Students</option>
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member._id}>
                <td style={cellStyle}>{member.name}</td>
                <td style={{ ...cellStyle, color: colors.muted }}>{member.email}</td>
                <td style={{ ...cellStyle, color: colors.teal }}>{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: '0.9rem', marginTop: '1.5rem' }}>Invite a teacher</h3>
      <form onSubmit={handleInvite} style={inlineFormStyle}>
        <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@email.com" style={inputStyle} />
        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} style={inputStyle}>
          <option value="teacher">teacher</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={sending} style={{ ...buttonStyle, opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Sending…' : 'Invite'}
        </button>
      </form>
      {sending && <p style={{ color: colors.muted, fontSize: '0.85rem' }}>Sending the email can take up to 15 seconds…</p>}
      {inviteMsg && (
        <p style={messageStyle(inviteMsg.ok)}>
          {inviteMsg.text}
          {inviteMsg.reason && <><br /><span>Reason: {inviteMsg.reason}</span></>}
          {inviteMsg.link && (
            <>
              <br /><span style={{ color: colors.muted }}>Link: {inviteMsg.link}</span>{' '}
              <button type="button" onClick={copyLink} style={{ ...ghostButtonStyle, marginTop: '0.4rem' }}>
                {inviteMsg.copied ? 'Copied' : 'Copy link'}
              </button>
            </>
          )}
        </p>
      )}
    </section>
  )
}
