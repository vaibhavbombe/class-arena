import { cellStyle, colors, tableWrapStyle } from '../styles.js'

// The contest board as the server computed it for this viewer (frozen for students during
// the freeze, live for staff). One cell per problem, ICPC style:
//   ✓ 15'  solved at minute 15   (+2 = two wrong tries before it; ⭐ = first to solve it)
//   −3     three wrong tries, not solved      ?2  two tries made during the freeze
function Cell({ cell }) {
  const extra = []
  if (cell.pending) extra.push(<span key="p" title="Being judged" style={{ color: colors.muted }}> …</span>)
  if (cell.frozenTries) extra.push(<span key="f" title="Tries during the freeze: results hidden until the end" style={{ color: colors.primary, fontWeight: 800 }}> ?{cell.frozenTries}</span>)
  if (cell.solved) {
    return (
      <td style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'nowrap', background: cell.firstSolve ? colors.successSolid : 'transparent', color: cell.firstSolve ? '#fff' : colors.success, fontWeight: 800 }}>
        {cell.firstSolve ? '⭐' : '✓'} {cell.minute}&apos;{cell.wrongTries ? <span style={{ fontWeight: 600 }}> +{cell.wrongTries}</span> : null}{extra}
      </td>
    )
  }
  return (
    <td style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'nowrap', color: colors.danger, fontWeight: 700 }}>
      {cell.wrongTries ? `−${cell.wrongTries}` : extra.length ? null : <span style={{ color: colors.muted }}>·</span>}{extra}
    </td>
  )
}

export default function Scoreboard({ board }) {
  if (!board) return null
  if (!board.rows.length) return <p style={{ color: colors.muted, fontSize: '0.9rem' }}>No students yet.</p>
  return (
    <div>
      {board.frozen && (
        <p role="status" style={{ margin: '0 0 0.5rem', fontWeight: 700, color: colors.primary }}>
          ❄ The board is frozen: results after the freeze show as “?” and are revealed when the contest ends.
        </p>
      )}
      <div style={tableWrapStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr>
              <th style={{ ...cellStyle, width: '3rem' }}>#</th>
              <th style={cellStyle}>Student</th>
              <th style={{ ...cellStyle, textAlign: 'center' }} title="Problems solved">Solved</th>
              <th style={{ ...cellStyle, textAlign: 'center' }} title={`Minutes to each solve + ${board.penaltyMinutes ?? 20} per wrong try on solved problems`}>Penalty</th>
              {board.problems.map((p) => <th key={p.label} style={{ ...cellStyle, textAlign: 'center' }} title={p.title}>{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.studentId} style={row.me ? { outline: `2px solid ${colors.primary}`, outlineOffset: '-2px' } : undefined}>
                <td style={{ ...cellStyle, fontWeight: 800 }}>{row.rank}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{row.name}{row.me ? ' (you)' : ''}</td>
                <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800 }}>{row.solved}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.penalty}</td>
                {row.problems.map((cell, i) => <Cell key={i} cell={cell} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
