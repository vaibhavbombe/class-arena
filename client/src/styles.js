// Shared inline styles (same dark theme as saas-starter).
export const colors = {
  bg: '#0B0B0D',
  surface: '#17171A',
  border: '#26262A',
  text: '#F5F5F3',
  muted: '#A6A6AC',
  accent: '#FF6B45',
  violet: '#7C6FF0',
  teal: '#4AD3C9',
}

export const pageStyle = {
  background: colors.bg,
  minHeight: '100vh',
  color: colors.text,
  fontFamily: 'monospace',
  padding: '2rem 1rem',
  boxSizing: 'border-box',
}

export const narrowPageStyle = { ...pageStyle, maxWidth: '400px', margin: '0 auto' }
export const widePageStyle = { ...pageStyle, maxWidth: '900px', margin: '0 auto' }

export const formStyle = { display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '1rem' }
export const inlineFormStyle = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }

export const inputStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  padding: '0.6rem',
  color: colors.text,
  fontFamily: 'monospace',
}

export const buttonStyle = {
  background: colors.accent,
  color: colors.bg,
  border: 'none',
  borderRadius: '6px',
  padding: '0.6rem 1rem',
  fontFamily: 'monospace',
  fontWeight: 'bold',
  cursor: 'pointer',
}

export const ghostButtonStyle = {
  background: 'none',
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  color: colors.muted,
  fontFamily: 'monospace',
  cursor: 'pointer',
}

export const sectionTitleStyle = { color: colors.violet, marginTop: '2rem', fontSize: '1rem' }
export const cellStyle = { padding: '0.5rem 0.5rem 0.5rem 0', borderBottom: '1px solid #1E1E22', textAlign: 'left' }
export const linkStyle = { color: colors.violet }
export const errorStyle = { color: colors.accent, fontSize: '0.85rem' }
export const codeStyle = { color: colors.teal, fontWeight: 'bold', letterSpacing: '0.15em' }

export function messageStyle(ok) {
  return { color: ok ? colors.teal : colors.accent, fontSize: '0.85rem', marginTop: '0.5rem', wordBreak: 'break-all' }
}
