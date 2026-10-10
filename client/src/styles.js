// Shared styles: a light, friendly look that matches the live game (purple brand,
// Montserrat, white rounded cards, chunky buttons). Every page takes its colours from
// here, and each colour has one meaning: primary = brand/actions, danger = errors and
// deletes, success = done/correct, link = links.
export const FONT = "'Montserrat', 'Segoe UI', system-ui, sans-serif"

export const colors = {
  bg: '#F2F0F7',
  surface: '#FFFFFF',
  border: '#E2DDEC',
  text: '#1B1B1F',
  muted: '#6B6680',
  primary: '#46178F',
  primaryDark: '#2B0D63',
  primarySoft: '#EDE7F8',
  danger: '#D01937',
  success: '#1F7A0A',
  warning: '#B98100',
  link: '#1368CE',
}

const shadow = '0 2px 6px rgba(43, 13, 99, 0.08)'

export const pageStyle = {
  minHeight: '100vh',
  color: colors.text,
  fontFamily: FONT,
  padding: '0 1rem 2.5rem',
  boxSizing: 'border-box',
}

// Login, signup and similar: a centred white card.
export const narrowPageStyle = {
  ...pageStyle,
  minHeight: 'auto',
  maxWidth: '420px',
  margin: '3rem auto',
  padding: '2rem 1.75rem',
  background: colors.surface,
  borderRadius: '16px',
  boxShadow: '0 8px 30px rgba(43, 13, 99, 0.12)',
}
export const widePageStyle = { ...pageStyle, maxWidth: '980px', margin: '0 auto' }

export const formStyle = { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }
export const inlineFormStyle = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }

export const cardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  boxShadow: shadow,
  padding: '1rem 1.25rem',
}

export const inputStyle = {
  background: colors.surface,
  border: `2px solid ${colors.border}`,
  borderRadius: '8px',
  padding: '0.6rem 0.75rem',
  color: colors.text,
  fontFamily: FONT,
  fontSize: '0.95rem',
}

export const buttonStyle = {
  background: colors.primary,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  padding: '0.65rem 1.1rem',
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: '0.95rem',
  cursor: 'pointer',
  boxShadow: `0 3px 0 ${colors.primaryDark}`,
}

export const ghostButtonStyle = {
  background: colors.surface,
  border: `2px solid ${colors.border}`,
  borderRadius: '8px',
  padding: '0.4rem 0.8rem',
  color: colors.text,
  fontFamily: FONT,
  fontWeight: 700,
  cursor: 'pointer',
}

export const dangerButtonStyle = { ...ghostButtonStyle, color: colors.danger, borderColor: '#F3C2CB' }

export const sectionTitleStyle = { color: colors.primary, marginTop: '2rem', fontSize: '1.1rem', fontWeight: 800 }
export const cellStyle = { padding: '0.65rem 0.6rem 0.65rem 0', borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }
export const linkStyle = { color: colors.link, fontWeight: 700, textDecoration: 'none' }
export const errorStyle = { color: colors.danger, fontSize: '0.85rem', fontWeight: 600 }
export const codeStyle = { color: colors.primary, fontWeight: 900, letterSpacing: '0.15em' }
export const titleStyle = { color: colors.primary, fontWeight: 900, margin: '0 0 0.25rem' }

export function messageStyle(ok) {
  return { color: ok ? colors.success : colors.danger, fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', wordBreak: 'break-word' }
}

// Tables sit on a white card so they read clearly on the lavender page.
export const tableWrapStyle = { overflowX: 'auto', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '0.25rem 1rem', boxShadow: shadow }
