import { useEffect, useState } from 'react'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cardStyle, cellStyle, colors, dangerButtonStyle, ghostButtonStyle, inputStyle, messageStyle, sectionTitleStyle, tableWrapStyle } from '../styles.js'

const EMPTY = { id: null, name: '', description: '', permissions: [] }

// Admins only (roles.manage): custom staff roles such as "Teaching Assistant" or
// "Head of Department", each a set of permissions. The server validates everything again.
export default function RolesPanel({ onChanged }) {
  const [catalog, setCatalog] = useState(null)
  const [roles, setRoles] = useState([])
  const [editing, setEditing] = useState(null) // null or a role being created/edited
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  function load() {
    api.get('/api/roles').then((response) => setRoles(response.data)).catch(() => setRoles([]))
  }
  useEffect(() => {
    api.get('/api/roles/catalog').then((response) => setCatalog(response.data)).catch(() => setCatalog(null))
    load()
  }, [])

  function toggle(permission) {
    setEditing((role) => ({
      ...role,
      permissions: role.permissions.includes(permission) ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission],
    }))
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const body = { name: editing.name, description: editing.description, permissions: editing.permissions }
    try {
      if (editing.id) await api.put(`/api/roles/${editing.id}`, body)
      else await api.post('/api/roles', body)
      setMessage({ ok: true, text: `Saved "${editing.name.trim()}". Members with this role get the change on their next action.` })
      setEditing(null)
      load()
      onChanged?.()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not save the role.') })
    } finally {
      setBusy(false)
    }
  }

  async function remove(role) {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return
    setMessage(null)
    try {
      await api.delete(`/api/roles/${role.id}`)
      setMessage({ ok: true, text: `Deleted "${role.name}".` })
      load()
      onChanged?.()
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not delete the role.') })
    }
  }

  if (!catalog) return null
  const groups = [...new Set(catalog.permissions.map((p) => p.group))]
  const labelOf = (name) => catalog.permissions.find((p) => p.name === name)?.label || name

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h2 style={sectionTitleStyle}>Roles</h2>
        {!editing && <button onClick={() => { setMessage(null); setEditing({ ...EMPTY }) }} style={buttonStyle}>+ New role</button>}
      </div>
      <p style={{ color: colors.muted, fontSize: '0.85rem', marginTop: 0 }}>
        Built-in: <strong>admin</strong> (everything), <strong>teacher</strong> ({catalog.builtIn.teacher.length} permissions), <strong>student</strong>.
        A custom role replaces the teacher permissions for the teachers you give it to.
      </p>

      {editing && (
        <form onSubmit={save} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <strong>{editing.id ? `Edit "${editing.name}"` : 'New role'}</strong>
          <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Role name, e.g. Teaching Assistant" aria-label="Role name" maxLength={40} required style={inputStyle} />
          <input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} placeholder="What it's for (optional)" aria-label="Description" maxLength={200} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {groups.map((group) => (
              <fieldset key={group} style={{ border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                <legend style={{ fontWeight: 800, fontSize: '0.85rem' }}>{group}</legend>
                {catalog.permissions.filter((p) => p.group === group).map((p) => (
                  <label key={p.name} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.15rem 0', color: p.adminOnly ? colors.muted : colors.text }}>
                    <input type="checkbox" checked={editing.permissions.includes(p.name)} disabled={p.adminOnly} onChange={() => toggle(p.name)} />
                    <span>{p.label}{p.adminOnly ? ' (admins only)' : ''}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Saving…' : 'Save role'}</button>
            <button type="button" onClick={() => setEditing({ ...editing, permissions: [...catalog.builtIn.teacher] })} style={ghostButtonStyle}>Start from teacher</button>
            <button type="button" onClick={() => setEditing(null)} style={ghostButtonStyle}>Cancel</button>
          </div>
        </form>
      )}
      {message && <p role="status" style={messageStyle(message.ok)}>{message.text}</p>}

      {roles.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>No custom roles yet.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead><tr><th style={cellStyle}>Role and what it can do</th><th style={cellStyle}>Members</th><th style={cellStyle}><span style={{ position: 'absolute', left: '-9999px' }}>Actions</span></th></tr></thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td style={cellStyle}>
                    <strong>{role.name}</strong>{role.description && <span style={{ color: colors.muted }}> · {role.description}</span>}
                    <div style={{ color: colors.muted, fontSize: '0.8rem', marginTop: '0.2rem' }}>{role.permissions.length ? role.permissions.map(labelOf).join(' · ') : 'nothing yet'}</div>
                  </td>
                  <td style={cellStyle}>{role.memberCount}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setMessage(null); setEditing({ id: role.id, name: role.name, description: role.description, permissions: role.permissions }) }} style={{ ...ghostButtonStyle, padding: '0.2rem 0.6rem' }}>Edit</button>{' '}
                    <button onClick={() => remove(role)} style={{ ...dangerButtonStyle, padding: '0.2rem 0.6rem' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
