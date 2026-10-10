import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { FONT } from '../game/look.jsx'

// "Live now" strip on a class page: students jump into the game, staff reopen the host screen.
export default function ActiveGamesBanner({ classId, isStaff }) {
  const [games, setGames] = useState([])

  useEffect(() => {
    let cancelled = false
    function load() {
      api.get('/api/live-games/active', { params: { classId } })
        .then((response) => !cancelled && setGames(response.data))
        .catch(() => !cancelled && setGames([]))
    }
    load()
    const timer = setInterval(load, 15000) // a game may start while the page is open
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [classId])

  if (!games.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}>
      {games.map((game) => (
        <div key={game.id} style={{ background: 'linear-gradient(120deg, #46178F, #2B0D63)', color: '#FFFFFF', borderRadius: '10px', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontFamily: FONT }}>
          <span style={{ background: '#E21B3C', borderRadius: '999px', padding: '0.15rem 0.6rem', fontWeight: 800, fontSize: '0.75rem' }}>● LIVE</span>
          <strong style={{ fontWeight: 800 }}>{game.title}</strong>
          <span style={{ opacity: 0.85, fontWeight: 600 }}>{game.status === 'lobby' ? 'Waiting for players' : 'In progress'} · PIN {game.pin}</span>
          <Link
            to={isStaff ? `/live-games/${game.id}/host` : `/play?pin=${game.pin}`}
            style={{ marginLeft: 'auto', background: '#FFFFFF', color: '#46178F', borderRadius: '6px', padding: '0.45rem 1rem', fontWeight: 800, textDecoration: 'none' }}
          >
            {isStaff ? 'Open host screen' : 'Join game'}
          </Link>
        </div>
      ))}
    </div>
  )
}
