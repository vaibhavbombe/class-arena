import { useEffect, useState } from 'react'

// Kahoot-style look for live games: bold type, purple stage, coloured answer tiles,
// each with a shape so colour is never the only cue (colour-blind friendly).
export const FONT = "'Montserrat', 'Segoe UI', system-ui, sans-serif"

export const TILES = [
  { color: '#E21B3C', shape: '▲', name: 'triangle' },
  { color: '#1368CE', shape: '◆', name: 'diamond' },
  { color: '#D89E00', shape: '●', name: 'circle' },
  { color: '#26890C', shape: '■', name: 'square' },
  { color: '#864CBF', shape: '★', name: 'star' },
  { color: '#0AA3A3', shape: '⬢', name: 'hexagon' },
  { color: '#FF8B00', shape: '✚', name: 'cross' },
  { color: '#E64980', shape: '♥', name: 'heart' },
]

export const stage = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg, #46178F 0%, #2B0D63 100%)',
  color: '#FFFFFF',
  fontFamily: FONT,
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
}

export const card = {
  background: '#FFFFFF',
  color: '#1B1B1B',
  borderRadius: '10px',
  boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
  padding: '1rem 1.25rem',
  fontFamily: FONT,
}

export const bigButton = {
  background: '#FFFFFF',
  color: '#46178F',
  border: 'none',
  borderRadius: '8px',
  padding: '0.8rem 1.6rem',
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: '1.1rem',
  cursor: 'pointer',
  boxShadow: '0 4px 0 rgba(0,0,0,0.3)',
}

export const quietButton = {
  background: 'rgba(255,255,255,0.15)',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  padding: '0.6rem 1.1rem',
  fontFamily: FONT,
  fontWeight: 700,
  cursor: 'pointer',
}

// Seconds left until `endsAt` (server time), corrected by `offset` (server minus local clock).
export function useSecondsLeft(endsAt, offset) {
  const compute = () => (endsAt ? Math.max(0, Math.ceil((endsAt - (Date.now() + offset)) / 1000)) : 0)
  const [seconds, setSeconds] = useState(compute)
  useEffect(() => {
    setSeconds(compute())
    if (!endsAt) return undefined
    const timer = setInterval(() => setSeconds(compute()), 250)
    return () => clearInterval(timer)
  }, [endsAt, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  return seconds
}

export function Countdown({ seconds, size = 72 }) {
  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds left`}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: seconds <= 5 ? '#E21B3C' : '#FFFFFF',
        color: seconds <= 5 ? '#FFFFFF' : '#46178F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: size * 0.42, boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
        transition: 'background 0.2s',
      }}
    >
      {seconds}
    </div>
  )
}

export function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')
  return `${n}${suffix}`
}
