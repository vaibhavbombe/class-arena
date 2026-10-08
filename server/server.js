require('dotenv').config()
const express = require('express')
const cors = require('cors')
const connectMongo = require('./config/mongo')

const app = express()
app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(express.json())

app.use('/api/auth', require('./routes/auth'))
app.use('/api/classes', require('./routes/classes'))
app.use('/api', require('./routes/institute'))

// Catch-all error handler. Log details on the server,
// send only a generic message to the client (no stack traces).
// Express 5 forwards errors thrown in async handlers here automatically.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Server error' })
})

const PORT = process.env.PORT || 5002
connectMongo()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((err) => {
    console.error('Startup failed:', err)
    process.exit(1)
  })
