import { Link, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../session.js'
import ThemeToggle from './ThemeToggle.jsx'
import { FONT, colors } from '../styles.js'

const navLinkStyle = ({ isActive }) => ({
  color: '#FFFFFF',
  opacity: isActive ? 1 : 0.75,
  textDecoration: 'none',
  fontWeight: 800,
  fontSize: '0.92rem',
  padding: '0.45rem 0.8rem',
  borderRadius: '999px',
  background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
  whiteSpace: 'nowrap',
})

// Full-width purple bar. The page container is centred, so the bar breaks out to the
// screen edges with negative margins and pads its content back into line.
export default function AppHeader({ me }) {
  const navigate = useNavigate()
  const isStaff = me.user.role !== 'student'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      style={{
        background: `linear-gradient(120deg, ${colors.brand}, ${colors.brandDark})`,
        color: '#FFFFFF',
        fontFamily: FONT,
        margin: '0 calc(50% - 50vw) 1.5rem',
        padding: '0.8rem calc(50vw - 50%)',
        boxShadow: '0 2px 10px rgba(43, 13, 99, 0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/dashboard" style={{ color: '#FFFFFF', textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: '0.6rem', minWidth: 0 }}>
          <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.01em' }}>ClassArena</span>
          <span style={{ opacity: 0.8, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.institution.name}</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {me.user.name}
            <span style={{ marginLeft: '0.4rem', background: 'rgba(255,255,255,0.2)', borderRadius: '999px', padding: '0.1rem 0.55rem', fontSize: '0.75rem' }}>{me.user.role}</span>
          </span>
          <ThemeToggle onBrand />
          <button onClick={handleLogout} style={{ background: 'transparent', color: '#FFFFFF', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontFamily: FONT, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Log out
          </button>
        </div>
      </div>
      <nav aria-label="Main" style={{ display: 'flex', gap: '0.35rem', marginTop: '0.6rem', overflowX: 'auto' }}>
        <NavLink to="/dashboard" style={navLinkStyle}>Classes</NavLink>
        {isStaff
          ? <NavLink to="/questions" style={navLinkStyle}>Question bank</NavLink>
          : <NavLink to="/play" style={navLinkStyle}>▶ Join a live game</NavLink>}
      </nav>
    </header>
  )
}
