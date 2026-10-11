const { findVisibleContest, onContestChange } = require('../lib/contests')

// Live contest boards. A client asks to watch a contest; the server checks access with the
// same rules as the HTTP API and joins it to the contest's room. When a submission is queued
// or judged, the room gets a small "updated" ping and every screen refetches its own board
// over HTTP. The board itself is never broadcast: during the freeze students and staff see
// different boards, and keeping that decision in one place (GET /standings) avoids leaks.

const room = (contestId) => `contest:${contestId}`

function registerContest(socket) {
  const identity = socket.data.user

  socket.on('contest:watch', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    try {
      const contest = await findVisibleContest(identity, String(payload?.contestId ?? ''))
      if (!contest) return reply({ error: 'Contest not found' })
      socket.join(room(contest.id))
      reply({ ok: true })
    } catch (err) {
      console.error('Contest watch failed:', err)
      reply({ error: 'Something went wrong' })
    }
  })

  socket.on('contest:unwatch', (payload) => {
    socket.leave(room(String(payload?.contestId ?? '')))
  })
}

function initContests(io) {
  onContestChange((contestId) => io.to(room(contestId)).emit('contest:updated', { contestId }))
}

module.exports = { registerContest, initContests }
