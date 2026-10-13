const mongoose = require('mongoose')

// A connection string contains the database password, so it must never reach a log, even
// inside an error message (driver errors can echo the URI or its credentials).
function redactCredentials(text) {
  return String(text).replace(/\/\/[^@/\s]+@/g, '//***@')
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error('MONGODB_URI is not defined')
  }

  try {
    // Fail within 15 s instead of hanging when the URI or network is wrong.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
  } catch (err) {
    throw new Error(`MongoDB connection failed (${err.name}): ${redactCredentials(err.message)}`)
  }
  console.log(`MongoDB connected (database "${mongoose.connection.db.databaseName}")`)
  return mongoose
}

module.exports = connectMongo
module.exports.redactCredentials = redactCredentials
