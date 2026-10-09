import { PASSWORD_RULES } from '../passwordRules.js'
import { colors } from '../styles.js'

// Live list of password rules under a "new password" field.
export default function PasswordChecklist({ password }) {
  if (!password) return null

  return (
    <ul aria-label="Password requirements" style={{ listStyle: 'none', padding: 0, margin: '-0.3rem 0 0', fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.9rem' }}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        // The length cap only matters once it's broken.
        if (ok && rule.label.startsWith('at most')) return null
        return (
          <li key={rule.label} style={{ color: ok ? colors.teal : colors.muted }}>
            {ok ? '✓' : '○'} {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
