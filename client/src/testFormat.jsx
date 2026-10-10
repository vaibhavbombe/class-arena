import { colors } from './styles.js'

// <input type="datetime-local"> works in local time without a zone; the API uses ISO (UTC).
export function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null
}

export function formatWhen(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
}

export function windowText(test) {
  const opens = formatWhen(test.opensAt)
  const closes = formatWhen(test.closesAt)
  if (opens && closes) return `${opens} – ${closes}`
  if (opens) return `Opens ${opens}`
  if (closes) return `Closes ${closes}`
  return 'No time window'
}

export const STATUS_COLORS = {
  draft: colors.muted,
  upcoming: colors.primary,
  open: colors.success,
  closed: colors.danger,
}

export function StatusBadge({ status }) {
  return (
    <span style={{ fontSize: '0.75rem', border: `1px solid ${STATUS_COLORS[status]}`, color: STATUS_COLORS[status], borderRadius: '999px', padding: '0.1rem 0.5rem' }}>
      {status}
    </span>
  )
}
