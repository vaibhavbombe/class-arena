import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { connectSocket, emitAck } from '../socket.js'
import useMe from '../useMe.js'
import { Countdown, FONT, bigButton, card, ordinal, quietButton, stage, useSecondsLeft } from '../game/look.jsx'
import { ResultChart, TileGrid } from '../game/parts.jsx'

// The student's screen, made for phones. The PIN lives in the URL (?pin=), so a refresh
// rejoins the same game and the server sends back exactly where it is.
export default function PlayGame() {
  const me = useMe()
  const [searchParams, setSearchParams] = useSearchParams()
  const pin = searchParams.get('pin') || ''
  const [pinInput, setPinInput] = useState(pin)
  const socketRef = useRef(null)
  const [phase, setPhase] = useState(pin ? 'connecting' : 'enter-pin') // enter-pin | connecting | lobby | question | answered | reveal | ended
  const [gameId, setGameId] = useState(null)
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState(null)
  const [picked, setPicked] = useState([])
  const [reveal, setReveal] = useState(null)
  const [result, setResult] = useState(null)
  const [final, setFinal] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0) // retrying the same PIN must reconnect too
  const secondsLeft = useSecondsLeft(['question', 'answered'].includes(phase) ? question?.endsAt : null, offset)

  useEffect(() => {
    if (!me || !pin) return undefined
    const socket = connectSocket()
    socketRef.current = socket

    socket.on('connect', async () => {
      const snap = await emitAck(socket, 'player:join', { pin })
      if (snap.error) {
        setError(snap.error)
        setPhase('enter-pin')
        socket.close()
        return
      }
      setError('')
      setGameId(snap.gameId)
      setTitle(snap.title)
      if (snap.status === 'question') {
        setOffset(snap.question.serverNow - Date.now())
        setQuestion(snap.question)
        setPicked([])
        setPhase(snap.answered ? 'answered' : 'question')
      } else if (snap.status === 'reveal') {
        setReveal(snap.reveal)
        setResult(snap.result || null)
        setPhase('reveal')
      } else {
        setPhase(snap.status)
      }
    })
    socket.on('game:question', (q) => {
      setOffset(q.serverNow - Date.now())
      setQuestion(q)
      setPicked([])
      setReveal(null)
      setResult(null)
      setPhase('question')
    })
    socket.on('game:reveal', (r) => {
      setReveal(r)
      setPhase('reveal')
    })
    socket.on('game:result', setResult)
    socket.on('game:final', setFinal)
    socket.on('game:ended', () => setPhase('ended'))
    return () => socket.close()
  }, [me, pin, attempt])

  function joinWithPin(event) {
    event.preventDefault()
    const clean = pinInput.replace(/\D/g, '')
    if (clean.length !== 6) {
      setError('The game PIN has 6 digits')
      return
    }
    setError('')
    setPhase('connecting')
    setSearchParams({ pin: clean }, { replace: true })
    setAttempt((n) => n + 1)
  }

  async function sendAnswer(optionIds) {
    if (sending) return
    setSending(true)
    const response = await emitAck(socketRef.current, 'player:answer', { gameId, index: question.index, optionIds })
    setSending(false)
    if (response.ok) {
      setPicked(optionIds)
      setPhase('answered')
    } else {
      setError(response.error)
      if (response.error === 'You already answered') setPhase('answered')
    }
  }

  function pick(optionId) {
    setError('')
    if (question.type === 'mcq') return sendAnswer([optionId])
    // Multi-select: tap to toggle, then submit.
    setPicked((current) => (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]))
  }

  if (!me) return null
  if (me.user.role !== 'student') {
    return (
      <div style={stage}>
        <Centered>
          <p style={{ fontWeight: 700 }}>Only students join games as players. Teachers start a game from a live quiz.</p>
          <Link to="/dashboard" style={{ ...quietButton, textDecoration: 'none' }}>Back to ClassArena</Link>
        </Centered>
      </div>
    )
  }

  return (
    <div style={stage}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 1rem', fontWeight: 800 }}>
        <span>{title || 'ClassArena Live'}</span>
        <span style={{ opacity: 0.85 }}>{me.user.name}</span>
      </header>
      {error && phase !== 'enter-pin' && <p role="alert" style={{ textAlign: 'center', background: 'rgba(226,27,60,0.9)', margin: '0 1rem', padding: '0.5rem', borderRadius: '8px', fontWeight: 700 }}>{error}</p>}

      {phase === 'enter-pin' && (
        <Centered>
          <h1 style={{ fontWeight: 900, fontSize: '2.2rem', margin: '0 0 1rem' }}>ClassArena Live</h1>
          <form onSubmit={joinWithPin} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 'min(320px, 100%)' }}>
            <input
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Game PIN"
              aria-label="Game PIN"
              maxLength={7}
              style={{ fontFamily: FONT, fontWeight: 800, fontSize: '1.6rem', textAlign: 'center', padding: '0.7rem', border: '2px solid #ccc', borderRadius: '6px', letterSpacing: '0.1em' }}
            />
            <button type="submit" style={{ ...bigButton, background: '#333', color: '#FFFFFF' }}>Enter</button>
            {error && <p role="alert" style={{ color: '#E21B3C', fontWeight: 700, margin: 0 }}>{error}</p>}
          </form>
          <Link to="/dashboard" style={{ color: '#FFFFFF', marginTop: '1.5rem', fontWeight: 600 }}>Back to ClassArena</Link>
        </Centered>
      )}

      {phase === 'connecting' && <Centered><h2 style={{ fontWeight: 800 }}>Joining…</h2></Centered>}

      {phase === 'lobby' && (
        <Centered>
          <h1 style={{ fontWeight: 900, fontSize: '2.4rem', margin: 0 }}>You're in!</h1>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', opacity: 0.9 }}>See your name on the screen?</p>
          <div style={{ ...card, fontWeight: 900, fontSize: '1.4rem', marginTop: '0.5rem' }}>{me.user.name}</div>
          <p style={{ opacity: 0.8, marginTop: '1.5rem', fontWeight: 600 }}>Waiting for your teacher to start…</p>
        </Centered>
      )}

      {phase === 'question' && question && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 0.8rem 0.8rem', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Countdown seconds={secondsLeft} size={56} />
            <div style={{ ...card, flex: 1, fontWeight: 800, fontSize: '1.05rem', padding: '0.7rem 0.9rem' }}>{question.prompt}</div>
          </div>
          <div style={{ fontWeight: 700, opacity: 0.85, fontSize: '0.9rem' }}>
            {question.number} of {question.total}{question.type === 'multi' ? ' · select all that apply, then submit' : ''}
          </div>
          <TileGrid options={question.options} onPick={pick} selected={picked} disabled={sending || secondsLeft === 0} />
          {question.type === 'multi' && (
            <button onClick={() => sendAnswer(picked)} disabled={!picked.length || sending} style={{ ...bigButton, opacity: picked.length ? 1 : 0.6 }}>
              Submit {picked.length ? `(${picked.length})` : ''}
            </button>
          )}
        </div>
      )}

      {phase === 'answered' && (
        <Centered>
          <div aria-hidden="true" style={{ fontSize: '3rem' }}>⏳</div>
          <h2 style={{ fontWeight: 900, fontSize: '1.8rem', margin: '0.5rem 0' }}>Answer locked in!</h2>
          <p style={{ fontWeight: 700, opacity: 0.85 }}>Waiting for the others… {secondsLeft > 0 ? `${secondsLeft}s` : ''}</p>
        </Centered>
      )}

      {phase === 'reveal' && (
        <ResultScreen result={result} reveal={reveal} />
      )}

      {phase === 'ended' && (
        <Centered>
          {final ? (
            <>
              <div aria-hidden="true" style={{ fontSize: '3.5rem' }}>{final.rank === 1 ? '🏆' : final.rank <= 3 ? '🎉' : '👏'}</div>
              <h1 style={{ fontWeight: 900, fontSize: '2.2rem', margin: '0.3rem 0' }}>{ordinal(final.rank)} place</h1>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>out of {final.playerCount} · {final.score} points</p>
              <p style={{ fontWeight: 600, opacity: 0.85 }}>{final.correctCount} of {final.questionCount} correct</p>
            </>
          ) : (
            <h2 style={{ fontWeight: 800 }}>The game has ended.</h2>
          )}
          <Link to="/dashboard" style={{ ...quietButton, textDecoration: 'none', marginTop: '1.5rem' }}>Back to ClassArena</Link>
        </Centered>
      )}
    </div>
  )
}

function Centered({ children }) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center' }}>{children}</div>
}

function ResultScreen({ result, reveal }) {
  if (!result) {
    // Joined during the reveal: show how the class answered.
    return reveal ? <div style={{ padding: '1rem' }}><ResultChart reveal={reveal} /></div> : null
  }
  const look = !result.answered
    ? { bg: '#555', title: "Time's up", icon: '⌛' }
    : result.correct
      ? { bg: '#26890C', title: 'Correct', icon: '✔' }
      : { bg: '#E21B3C', title: 'Incorrect', icon: '✖' }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: look.bg, padding: '1rem' }}>
      <div aria-hidden="true" style={{ fontSize: '3.5rem', fontWeight: 900 }}>{look.icon}</div>
      <h1 style={{ fontWeight: 900, fontSize: '2.4rem', margin: '0.2rem 0' }}>{look.title}</h1>
      {result.correct && <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.5rem 1.2rem', borderRadius: '6px', fontWeight: 900, fontSize: '1.5rem' }}>+ {result.points}</div>}
      {!result.correct && reveal && (
        <p style={{ fontWeight: 700 }}>Answer: {reveal.options.filter((o) => o.correct).map((o) => o.text).join(', ')}</p>
      )}
      <p style={{ fontWeight: 800, fontSize: '1.2rem', marginTop: '1.2rem' }}>
        {result.rank ? `You're in ${ordinal(result.rank)} place` : ''} · {result.score} points
      </p>
    </div>
  )
}
