import { useEffect, useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { can } from '../permissions.js'
import { buttonStyle, cellStyle, colors, ghostButtonStyle, inlineFormStyle, inputStyle, messageStyle, sectionTitleStyle, tableWrapStyle } from '../styles.js'

// Everyone in the institute (members.view), the invite form (members.invite), removing
// members (members.remove), giving teachers a custom role (roles.manage, admins only) and resetting
// a member's two-factor login when they've lost their phone and recovery codes (security.manage).
export default function MembersPanel({ me, rolesVersion = 0 }) {
  const currentUserId = me.user.id
  const isAdmin = me.user.role === 'admin'
  const canInvite = can(me, 'members.invite')
  const canRemove = can(me, 'members.remove')
  const canAssign = can(me, 'roles.manage')
  const canResetMfa = can(me, 'security.manage')
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [roleFilter, setRoleFilter] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('teacher')
  const [inviteMsg, setInviteMsg] = useState(null)
  const [sending, setSending] = useState(false)
  const [removeMsg, setRemoveMsg] = useState(null)
  const [mfaReset, setMfaReset] = useState(null) // { member, password } while confirming a reset

  function loadMembers() {
    api.get('/api/members', { params: roleFilter ? { role: roleFilter } : {} })
      .then((response) => setMembers(response.data))
      .catch(() => setMembers([]))
  }

  useEffect(loadMembers, [roleFilter, rolesVersion])
  useEffect(() => {
    if (!canAssign) return
    api.get('/api/roles').then((response) => setRoles(response.data)).catch(() => setRoles([]))
  }, [canAssign, rolesVersion])

  async function assignRole(member, roleId) {
    setRemoveMsg(null)
    try {
      const response = await api.put(`/api/members/${member._id}/role`, { roleId: roleId || null })
      setRemoveMsg({ ok: true, text: `${member.name} is now: ${response.data.roleName}. It applies on their next action.` })
      loadMembers()
    } catch (requestError) {
      setRemoveMsg({ ok: false, text: errorMessage(requestError, 'Could not change the role.') })
    }
  }

  async function resetMfa(event) {
    event.preventDefault()
    setRemoveMsg(null)
    try {
      const response = await api.post(`/api/members/${mfaReset.member._id}/mfa-reset`, { password: mfaReset.password })
      setMfaReset(null)
      setRemoveMsg({ ok: true, text: response.data.message })
      loadMembers()
    } catch (requestError) {
      setRemoveMsg({ ok: false, text: errorMessage(requestError, 'Could not reset two-factor login.') })
    }
  }

  async function removeMember(member) {
    const consequence = member.role === 'student'
      ? 'They will be removed from all their classes and signed out.'
      : 'They will be signed out and lose access to this institute.'
    if (!window.confirm(`Remove ${member.name} (${member.role})? ${consequence} This can't be undone.`)) return
    setRemoveMsg(null)
    try {
      const response = await api.delete(`/api/members/${member._id}`)
      setRemoveMsg({ ok: true, text: response.data.message })
      loadMembers()
    } catch (requestError) {
      setRemoveMsg({ ok: false, text: errorMessage(requestError, 'Could not remove this member.') })
    }
  }

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
      <div style={tableWrapStyle}>
        <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>Role</th>
              <th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member._id}>
                <td style={cellStyle}>
                  {member.name}
                  {member.mfaEnabled && <span title="Two-factor login is on" style={{ marginLeft: '0.4rem', fontSize: '0.7rem', fontWeight: 800, color: colors.success, border: `1px solid ${colors.success}`, borderRadius: '999px', padding: '0 0.4rem' }}>2FA</span>}
                </td>
                <td style={{ ...cellStyle, color: colors.muted }}>{member.email}</td>
                <td style={{ ...cellStyle, color: colors.success }}>
                  {member.role === 'teacher' && canAssign ? (
                    <select value={member.customRoleId || ''} onChange={(event) => assignRole(member, event.target.value)} aria-label={`Role for ${member.name}`} style={{ ...inputStyle, padding: '0.2rem 0.4rem' }}>
                      <option value="">teacher (default)</option>
                      {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                  ) : member.roleName || member.role}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  {member._id === currentUserId ? (
                    <span style={{ color: colors.muted }}>you</span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {canResetMfa && member.mfaEnabled && (
                        <button onClick={() => { setRemoveMsg(null); setMfaReset({ member, password: '' }) }} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Reset 2FA</button>
                      )}
                      {canRemove && !(member.role === 'admin' && !isAdmin) && (
                        <button onClick={() => removeMember(member)} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Remove</button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mfaReset && (
        <form onSubmit={resetMfa} style={inlineFormStyle}>
          <p style={{ margin: 0, width: '100%', fontSize: '0.85rem' }}>
            Reset two-factor login for <strong>{mfaReset.member.name}</strong>? Only do this if you've confirmed it's really
            them. They'll be signed out everywhere and can set it up again.
          </p>
          <input type="password" required value={mfaReset.password} onChange={(event) => setMfaReset({ ...mfaReset, password: event.target.value })} placeholder="Your password" autoComplete="current-password" style={inputStyle} />
          <button type="submit" style={buttonStyle}>Reset 2FA</button>
          <button type="button" onClick={() => setMfaReset(null)} style={ghostButtonStyle}>Cancel</button>
        </form>
      )}
      {removeMsg && <p role="status" style={messageStyle(removeMsg.ok)}>{removeMsg.text}</p>}

      {canInvite && <>
      <h3 style={{ fontSize: '0.9rem', marginTop: '1.5rem' }}>Invite a teacher</h3>
      <form onSubmit={handleInvite} style={inlineFormStyle}>
        <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teacher@email.com" style={inputStyle} />
        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} style={inputStyle}>
          <option value="teacher">teacher</option>
          {isAdmin && <option value="admin">admin</option>}
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
      </>}
    </section>
  )
}
