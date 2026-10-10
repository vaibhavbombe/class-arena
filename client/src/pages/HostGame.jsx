import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { connectSocket, emitAck } from '../socket.js'
import useMe from '../useMe.js'
import { Countdown, bigButton, card, quietButton, stage, useSecondsLeft } from '../game/look.jsx'
import { Leaderboard, Podium, ResultChart, TileGrid } from '../game/parts.jsx'

// The teacher's screen, made to be projected. It never shows which answer is right until
// the server reveals it (students may be looking at it).
export default function HostGame() {
  const { id } = useParams()
  const me = useMe()
  const socketRef = useRef(null)
  const [game, setGame] = useState(null) // { pin, title, total }
  const [phase, setPhase] = useState('connecting') // connecting | lobby | question | reveal | ended
  const [players, setPlayers] = useState([])
  const [question, setQuestion] = useState(null)
  const [progress, setProgress] = useState({ answeredCount: 0, playerCount: 0, distribution: null })
  const [reveal, setReveal] = useState(null)
  const [final, setFinal] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLive, setShowLive] = useState(false)
  const [offset, setOffset] = useState(0)
  const secondsLeft = useSecondsLeft(phase === 'question' ? question?.endsAt : null, offset)

  useEffect(() => {
    if (!me) return undefined
    const socket = connectSocket()
    socketRef.current = socket

    // (Re)join as host on every connect: after a refresh or a dropped connection the
    // server sends a full snapshot, so the screen picks up where the game is.
    socket.on('connect', async () => {
      const snap = await emitAck(socket, 'host:join', { gameId: id })
      if (snap.error) {
        setError(snap.error)
        setPhase(snap.ended ? 'ended' : 'connecting')
        return
      }
      setError('')
      setGame({ pin: snap.pin, title: snap.title, total: snap.total })
      setPlayers(snap.players)
      setPhase(snap.status)
      if (snap.question) {
        setOffset(new Date(snap.question.serverNow).getTime() - Date.now())
        setQuestion(snap.question)
        setProgress({ ...snap.progress, distribution: null })
      }
      if (snap.reveal) setReveal(snap.reveal)
    })
    socket.on('game:players', ({ players: list }) => setPlayers(list))
    socket.on('game:question', (q) => {
      setOffset(q.serverNow - Date.now())
      setQuestion(q)
      setReveal(null)
      setProgress({ answeredCount: 0, playerCount: 0, distribution: null })
      setPhase('question')
    })
    socket.on('game:progress', (p) => setProgress((current) => ({ ...current, ...p })))
    socket.on('game:reveal', (r) => {
      setReveal(r)
      setPhase('reveal')
    })
    socket.on('game:ended', (summary) => {
      setFinal(summary)
      setPhase('ended')
    })
    return () => socket.close()
  }, [me, id])

  async function act(event, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    const response = await emitAck(socketRef.current, event, { gameId: id })
    setBusy(false)
    if (response.error) setError(response.error)
  }

  if (!me) return null

  const header = (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
      <strong style={{ fontSize: '1.1rem', fontWeight: 800 }}>{game?.title || 'Live quiz'}</strong>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {game && phase !== 'ended' && <span style={{ fontWeight: 700, opacity: 0.85 }}>PIN {game.pin}</span>}
        {phase !== 'ended' && phase !== 'connecting' && (
          <button onClick={() => act('host:end', 'End the game now? Scores so far will be final.')} disabled={busy} style={quietButton}>End game</button>
        )}
      </div>
    </header>
  )

  return (
    <div style={stage}>
      {header}
      {error && <p role="alert" style={{ textAlign: 'center', background: 'rgba(226,27,60,0.9)', margin: '0 1rem', padding: '0.6rem', borderRadius: '8px', fontWeight: 700 }}>{error}</p>}

      {phase === 'connecting' && !error && <Centered><h2>Connecting…</h2></Centered>}

      {phase === 'lobby' && game && (
        <Centered>
          <div style={{ ...card, textAlign: 'center', padding: '1.25rem 2.5rem' }}>
            <div style={{ fontWeight: 700, color: '#555' }}>Join at <strong style={{ color: '#46178F' }}>{window.location.host}/play</strong> with Game PIN:</div>
            <div style={{ fontSize: 'clamp(3rem, 12vw, 6rem)', fontWeight: 900, letterSpacing: '0.08em', color: '#1B1B1B', lineHeight: 1.1 }}>{game.pin}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
            <span style={{ ...quietButton, cursor: 'default', fontSize: '1.1rem' }}>👤 {players.length}</span>
            <button onClick={() => act('host:next')} disabled={busy || players.length === 0} style={{ ...bigButton, opacity: players.length ? 1 : 0.6 }}>Start</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center', marginTop: '1.5rem', maxWidth: '900px' }}>
            {players.length === 0 && <p style={{ opacity: 0.8, fontWeight: 600 }}>Waiting for players…</p>}
            {players.map((name) => (
              <span key={name} style={{ background: 'rgba(255,255,255,0.18)', padding: '0.45rem 0.9rem', borderRadius: '6px', fontWeight: 800, fontSize: '1.05rem', animation: 'popIn 0.25s ease-out' }}>{name}</span>
            ))}
          </div>
        </Centered>
      )}

      {phase === 'question' && question && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 1.25rem 1.25rem', gap: '1rem' }}>
          <div style={{ ...card, textAlign: 'center', fontSize: 'clamp(1.2rem, 3vw, 2rem)', fontWeight: 800 }}>{question.prompt}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Countdown seconds={secondsLeft} size={84} />
            <span style={{ opacity: 0.85, fontWeight: 700 }}>Question {question.number} of {question.total}{question.type === 'multi' ? ' · select all that apply' : ''}</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900 }}>{progress.answeredCount}</div>
              <div style={{ fontWeight: 700, opacity: 0.85 }}>Answers</div>
            </div>
          </div>
          <TileGrid options={question.options} renderExtra={(option) => (showLive && progress.distribution ? <span style={{ marginLeft: 'auto', fontWeight: 900 }}>{progress.distribution[option.id] || 0}</span> : null)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 600, opacity: 0.9 }}>
              <input type="checkbox" checked={showLive} onChange={(event) => setShowLive(event.target.checked)} />
              Show live answer counts (hide this if your screen is projected)
            </label>
            <button onClick={() => act('host:skip')} disabled={busy} style={quietButton}>Skip ▸</button>
          </div>
        </div>
      )}

      {phase === 'reveal' && reveal && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 1.25rem 1.25rem', gap: '1rem' }}>
          <div style={{ ...card, textAlign: 'center', fontSize: 'clamp(1.1rem, 2.5vw, 1.6rem)', fontWeight: 800 }}>{reveal.prompt}</div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <ResultChart reveal={reveal} />
            <Leaderboard entries={reveal.leaderboard} />
          </div>
          {reveal.explanation && <div style={{ ...card, background: 'rgba(255,255,255,0.92)' }}><strong>Why: </strong>{reveal.explanation}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, opacity: 0.85 }}>{reveal.answeredCount} of {reveal.playerCount} answered · Question {reveal.number} of {reveal.total}</span>
            <button onClick={() => act('host:next')} disabled={busy} style={bigButton}>{reveal.isLast ? 'Show podium 🏆' : 'Next ▸'}</button>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <Centered>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0 0 1rem' }}>{game?.title}</h2>
          {final ? (
            <>
              <Podium podium={final.podium} />
              {final.leaderboard.length > 3 && <div style={{ marginTop: '1.5rem', width: 'min(520px, 100%)' }}><Leaderboard entries={final.leaderboard.slice(3)} title="Also played" /></div>}
            </>
          ) : (
            <p style={{ fontWeight: 600 }}>This game has ended.</p>
          )}
          <Link to="/dashboard" style={{ ...quietButton, textDecoration: 'none', marginTop: '1.5rem' }}>Back to ClassArena</Link>
        </Centered>
      )}
      <style>{'@keyframes popIn { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }'}</style>
    </div>
  )
}

function Centered({ children }) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center' }}>{children}</div>
}
