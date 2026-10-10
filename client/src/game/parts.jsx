import { FONT, TILES, card, ordinal } from './look.jsx'

// Pieces shared by the host and player screens.

export function TileGrid({ options, renderExtra, onPick, selected, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.75rem', flex: 1 }}>
      {options.map((option, i) => {
        const tile = TILES[i % TILES.length]
        const isSelected = selected?.includes(option.id)
        const content = (
          <>
            <span aria-hidden="true" style={{ fontSize: '1.8rem', lineHeight: 1 }}>{tile.shape}</span>
            <span style={{ fontWeight: 800, fontSize: 'clamp(1rem, 2.2vw, 1.4rem)', textAlign: 'left' }}>{option.text}</span>
            {renderExtra?.(option)}
          </>
        )
        const style = {
          background: tile.color, color: '#FFFFFF', border: isSelected ? '4px solid #FFFFFF' : '4px solid transparent',
          borderRadius: '8px', padding: '1rem 1.1rem', minHeight: '84px', display: 'flex', alignItems: 'center', gap: '0.9rem',
          boxShadow: '0 4px 0 rgba(0,0,0,0.25)', fontFamily: FONT, transform: isSelected ? 'scale(0.98)' : 'none',
        }
        return onPick ? (
          <button key={option.id} onClick={() => onPick(option.id)} disabled={disabled} aria-pressed={isSelected} aria-label={`${tile.name}: ${option.text}`} style={{ ...style, cursor: disabled ? 'default' : 'pointer', opacity: disabled && !isSelected ? 0.55 : 1 }}>
            {content}
          </button>
        ) : (
          <div key={option.id} style={style}>{content}</div>
        )
      })}
    </div>
  )
}

export function ResultChart({ reveal }) {
  const max = Math.max(1, ...Object.values(reveal.distribution))
  return (
    <div style={{ flex: '2 1 360px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '0.75rem', minHeight: '220px' }} aria-label="How the class answered">
      {reveal.options.map((option, i) => {
        const tile = TILES[i % TILES.length]
        const count = reveal.distribution[option.id] || 0
        return (
          <div key={option.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', width: '90px', opacity: option.correct ? 1 : 0.45 }}>
            <span style={{ fontWeight: 900, fontSize: '1.3rem' }}>{count} {option.correct ? '✓' : ''}</span>
            <div style={{ width: '100%', height: `${Math.max(8, (count / max) * 160)}px`, background: tile.color, borderRadius: '6px 6px 0 0', transition: 'height 0.6s ease-out' }} />
            <div style={{ width: '100%', background: tile.color, borderRadius: '0 0 6px 6px', padding: '0.35rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, wordBreak: 'break-word' }}>
              <span aria-hidden="true">{tile.shape}</span> {option.text}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Leaderboard({ entries, title = 'Leaderboard' }) {
  return (
    <div style={{ flex: '1 1 260px', ...card }}>
      <div style={{ fontWeight: 900, color: '#46178F', marginBottom: '0.5rem' }}>{title}</div>
      {entries.length === 0 && <div style={{ color: '#666' }}>No players yet</div>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <li key={`${entry.rank}-${entry.name}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #eee', fontWeight: 700 }}>
            <span>{ordinal(entry.rank)} · {entry.name}</span>
            <span>{entry.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Podium({ podium }) {
  const order = [podium[1], podium[0], podium[2]] // 2nd, 1st, 3rd
  const heights = { 1: 180, 2: 130, 3: 95 }
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' }
  if (!podium.length) return <p style={{ fontWeight: 600 }}>Nobody played this time.</p>
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', justifyContent: 'center' }}>
      {order.map((entry) => entry && (
        <div key={entry.rank} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(150px, 28vw)' }}>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', marginBottom: '0.3rem', textAlign: 'center', wordBreak: 'break-word' }}>{entry.name}</div>
          <div style={{ fontWeight: 700, opacity: 0.9, marginBottom: '0.4rem' }}>{entry.score}</div>
          <div style={{ width: '100%', height: heights[entry.rank], background: entry.rank === 1 ? '#FFFFFF' : 'rgba(255,255,255,0.75)', color: '#46178F', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', fontSize: '2.2rem', paddingTop: '0.5rem', boxShadow: '0 4px 0 rgba(0,0,0,0.25)' }}>
            {medals[entry.rank]}
          </div>
        </div>
      ))}
    </div>
  )
}
