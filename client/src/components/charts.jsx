import { useState } from 'react'
import { cardStyle, colors } from '../styles.js'

// Small, dependency-free charts for the analytics page. One series each, so one hue
// (colors.chart, validated per theme) and no legend; values are always shown as text too.

export function StatTile({ label, value, hint }) {
  return (
    <div style={{ ...cardStyle, boxSizing: 'border-box', padding: '0.8rem 1rem', minWidth: '9rem', flex: '1 1 9rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 900, marginTop: '0.15rem' }}>{value ?? '—'}</div>
      {hint && <div style={{ fontSize: '0.8rem', color: colors.muted, fontWeight: 600 }}>{hint}</div>}
    </div>
  )
}

// Tooltip shown on hover and on keyboard focus.
function useTip() {
  const [tip, setTip] = useState(null)
  const bind = (content) => ({
    onMouseEnter: () => setTip(content),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip(content),
    onBlur: () => setTip(null),
    tabIndex: 0,
  })
  const box = tip && (
    <div role="status" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: colors.text, color: colors.surface, borderRadius: '8px', padding: '0.45rem 0.7rem', fontSize: '0.8rem', fontWeight: 700, pointerEvents: 'none', maxWidth: '16rem', zIndex: 2 }}>
      {tip}
    </div>
  )
  return { bind, box }
}

// Columns on a fixed 0–100% scale, one per test in time order. Centred and capped in width,
// so a few tests don't bunch up at one edge; names wrap to two lines.
const COLUMN_FLEX = '0 1 120px'
const COLUMN_GAP = '0.75rem'

export function TrendColumns({ points, studentCount }) {
  const { bind, box } = useTip()
  const showLabels = points.length <= 12 // direct labels only while there's room; the tooltip always works
  return (
    <div style={{ ...cardStyle, position: 'relative' }}>
      {box}
      <div style={{ position: 'relative', height: '180px', marginLeft: '2.4rem' }}>
        {[100, 50, 0].map((line) => (
          <div key={line} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: `1px ${line === 0 ? 'solid' : 'dashed'} ${colors.border}` }}>
            <span style={{ position: 'absolute', left: '-2.4rem', top: '-0.55rem', fontSize: '0.7rem', color: colors.muted, fontWeight: 700 }}>{line}%</span>
          </div>
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: COLUMN_GAP, padding: '0 0.25rem' }}>
          {points.map((point) => {
            const value = point.averagePercent
            const label = `${point.title}: ${value === null ? 'no submissions yet' : `${value}% average`} · ${point.submitted} of ${studentCount} submitted`
            return (
              <div key={point.testId} {...bind(label)} aria-label={label} style={{ flex: COLUMN_FLEX, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', outlineOffset: '2px', cursor: 'default' }}>
                {showLabels && <span style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.2rem' }}>{value === null ? '—' : `${Math.round(value)}%`}</span>}
                <div style={{ width: '70%', minWidth: '10px', height: value === null ? '2px' : `${Math.max(value, 1)}%`, background: value === null ? colors.border : colors.chart, borderRadius: '4px 4px 0 0' }} />
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: COLUMN_GAP, marginLeft: '2.4rem', padding: '0.4rem 0.25rem 0' }}>
        {points.map((point) => (
          <div key={point.testId} title={point.title} style={{ flex: COLUMN_FLEX, fontSize: '0.72rem', fontWeight: 700, color: colors.muted, textAlign: 'center', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25 }}>
            {point.title}
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal bars, weakest first. Below 50% gets a "needs work" flag in words + icon.
export function TopicBars({ topics }) {
  const { bind, box } = useTip()
  return (
    <div style={{ ...cardStyle, position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {box}
      {topics.map((topic) => {
        const label = `${topic.tag}: ${topic.percentCorrect}% correct (${topic.correct} of ${topic.total} answers)`
        const weak = topic.percentCorrect < 50
        return (
          <div key={topic.tag} {...bind(label)} aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(6rem, 9rem) 1fr 3.2rem', alignItems: 'center', gap: '0.6rem', cursor: 'default' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{topic.tag}</span>
            <div style={{ height: '12px', background: colors.border, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(topic.percentCorrect, 1)}%`, height: '100%', background: colors.chart, borderRadius: '0 4px 4px 0' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}>{Math.round(topic.percentCorrect)}%</span>
            {weak && <span style={{ gridColumn: '2 / 4', marginTop: '-0.35rem', fontSize: '0.75rem', fontWeight: 700, color: colors.danger }}>⚠ Needs work</span>}
          </div>
        )
      })}
    </div>
  )
}
