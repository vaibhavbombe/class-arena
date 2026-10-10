// Shared styles: a friendly look that matches the live game (purple brand, Montserrat,
// rounded cards, chunky buttons). Every page takes its colours from here, and each colour
// has one meaning: primary = brand text/accents, danger = errors and deletes,
// success = done/correct, link = links. Solid colours (brand, successSolid) are for
// backgrounds behind white text.
//
// The values are CSS variables defined in global.css for light and dark mode, so the
// whole app switches theme without re-rendering anything.
export const FONT = "'Montserrat', 'Segoe UI', system-ui, sans-serif"

export const colors = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceHover: 'var(--surface-hover)',
  border: 'var(--border)',
  text: 'var(--text)',
  muted: 'var(--muted)',
  primary: 'var(--primary)',
  brand: 'var(--brand)',
  brandDark: 'var(--brand-dark)',
  danger: 'var(--danger)',
  dangerBorder: 'var(--danger-border)',
  success: 'var(--success)',
  successSolid: 'var(--success-solid)',
  successSolidDark: 'var(--success-solid-dark)',
  link: 'var(--link)',
  chart: 'var(--chart-1)', // chart marks (validated per theme)
}

const shadow = 'var(--shadow)'

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
  width: 'min(420px, calc(100% - 2rem))',
  margin: '4.5rem auto 2rem',
  padding: '2rem 1.75rem',
  background: colors.surface,
  borderRadius: '16px',
  boxShadow: 'var(--shadow-strong)',
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
  background: colors.brand,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  padding: '0.65rem 1.1rem',
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: '0.95rem',
  cursor: 'pointer',
  boxShadow: `0 3px 0 ${colors.brandDark}`,
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

export const dangerButtonStyle = { ...ghostButtonStyle, color: colors.danger, borderColor: colors.dangerBorder }

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
