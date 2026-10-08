import { Link, useNavigate } from 'react-router-dom'
import { logout } from '../session.js'
import { colors, ghostButtonStyle } from '../styles.js'

export default function AppHeader({ me }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: colors.accent, margin: 0 }}>
          <Link to="/dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>{me.institution.name}</Link>
        </h1>
        <button onClick={handleLogout} style={ghostButtonStyle}>Log out</button>
      </div>
      <p style={{ color: colors.muted }}>
        Logged in as {me.user.name} <span style={{ color: colors.teal }}>({me.user.role})</span>
      </p>
    </header>
  )
}
