import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { errorMessage } from '../session.js'
import { buttonStyle, cardStyle, colors, ghostButtonStyle, inputStyle, linkStyle, messageStyle, sectionTitleStyle } from '../styles.js'

export const CONTEST_STATUS = {
  draft: { text: 'Draft', color: 'muted' },
  upcoming: { text: 'Upcoming', color: 'primary' },
  running: { text: '● Live', color: 'success' },
  frozen: { text: '❄ Live (frozen)', color: 'primary' },
  ended: { text: 'Ended', color: 'muted' },
}

const when = (date) => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Coding contests in a class. Staff create them here and set them up on the contest page.
export default function ContestsPanel({ classId, isStaff, canCreate = isStaff }) {
  const navigate = useNavigate()
  const [contests, setContests] = useState([])
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    api.get('/api/contests', { params: { classId } }).then((response) => setContests(response.data)).catch(() => setContests([]))
  }, [classId])

  async function create(event) {
    event.preventDefault()
    setMessage(null)
    try {
      const response = await api.post('/api/contests', { classId, title })
      navigate(`/contests/${response.data.id}`)
    } catch (requestError) {
      setMessage({ ok: false, text: errorMessage(requestError, 'Could not create the contest.') })
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={sectionTitleStyle}>Coding contests</h3>
        {canCreate && <button onClick={() => setCreating((open) => !open)} style={creating ? ghostButtonStyle : buttonStyle}>{creating ? 'Close' : '+ New contest'}</button>}
      </div>
      {creating && (
        <form onSubmit={create} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contest title, e.g. Friday Cup" aria-label="Contest title" maxLength={200} required style={{ ...inputStyle, flex: '1 1 220px' }} />
          <button type="submit" style={buttonStyle}>Create</button>
        </form>
      )}
      {message && <p role="alert" style={messageStyle(message.ok)}>{message.text}</p>}

      {contests.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '0.85rem' }}>
          {isStaff ? 'No contests yet. A contest is a timed race on coding problems with a live leaderboard.' : 'No contests yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
          {contests.map((contest) => {
            const status = CONTEST_STATUS[contest.status]
            const live = contest.status === 'running' || contest.status === 'frozen'
            return (
              <article key={contest.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.8rem 1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <Link to={`/contests/${contest.id}`} style={{ ...linkStyle, fontSize: '1.02rem' }}>{contest.title}</Link>
                  <div style={{ color: colors.muted, fontSize: '0.8rem', fontWeight: 600 }}>
                    {contest.problemCount} problem{contest.problemCount === 1 ? '' : 's'} · {contest.durationMinutes} min
                    {contest.startsAt ? ` · ${contest.status === 'ended' ? 'ran' : contest.status === 'upcoming' ? 'starts' : 'started'} ${when(contest.startsAt)}` : ''}
                  </div>
                </div>
                <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ color: colors[status.color], fontWeight: 800, fontSize: '0.85rem' }}>{status.text}</span>
                  <Link to={`/contests/${contest.id}`} style={{ ...(live && !isStaff ? buttonStyle : ghostButtonStyle), textDecoration: 'none', padding: '0.5rem 1rem' }}>
                    {isStaff ? 'Open' : live ? 'Enter ▸' : contest.status === 'ended' ? 'Results' : 'View'}
                  </Link>
                </span>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
