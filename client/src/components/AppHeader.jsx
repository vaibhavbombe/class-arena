import { Link, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../session.js'
import { colors, ghostButtonStyle } from '../styles.js'

const navLinkStyle = ({ isActive }) => ({
  color: isActive ? colors.text : colors.muted,
  textDecoration: 'none',
  borderBottom: `2px solid ${isActive ? colors.accent : 'transparent'}`,
  paddingBottom: '0.2rem',
  fontSize: '0.9rem',
})

export default function AppHeader({ me }) {
  const navigate = useNavigate()
  const isStaff = me.user.role !== 'student'

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
      <nav aria-label="Main" style={{ display: 'flex', gap: '1.25rem', borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.4rem' }}>
        <NavLink to="/dashboard" style={navLinkStyle}>Classes</NavLink>
        {isStaff
          ? <NavLink to="/questions" style={navLinkStyle}>Question bank</NavLink>
          : <NavLink to="/play" style={navLinkStyle}>Join a live game</NavLink>}
      </nav>
    </header>
  )
}
