import { useState } from 'react'
import { THEMES, getTheme, setTheme } from '../theme.js'
import { FONT } from '../styles.js'

const LABELS = { system: 'System', light: 'Light', dark: 'Dark' }
const ICONS = { system: '🖥️', light: '☀️', dark: '🌙' }

// Cycles System → Light → Dark. `onBrand` styles it for the purple header; otherwise it's a
// small floating button for pages without a header (login, signup...).
export default function ThemeToggle({ onBrand = false }) {
  const [theme, setCurrent] = useState(getTheme)

  function cycle() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    setTheme(next)
    setCurrent(next)
  }

  const label = `Theme: ${LABELS[theme]}. Click to switch.`
  const style = onBrand
    ? { background: 'transparent', color: '#FFFFFF', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', padding: '0.3rem 0.6rem' }
    : {
      position: 'fixed', top: '1rem', right: '1rem', zIndex: 10,
      background: 'var(--surface)', color: 'var(--text)', border: '2px solid var(--border)', borderRadius: '999px',
      padding: '0.4rem 0.8rem', boxShadow: 'var(--shadow)',
    }

  return (
    <button type="button" onClick={cycle} title={label} aria-label={label} style={{ ...style, fontFamily: FONT, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span aria-hidden="true">{ICONS[theme]}</span>
      {/* In the header there's little room on phones: icon only (the label is in title/aria-label). */}
      {!onBrand && <span style={{ fontSize: '0.85rem' }}>{LABELS[theme]}</span>}
    </button>
  )
}
