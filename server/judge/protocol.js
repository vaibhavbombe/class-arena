// Names shared by the API (queue.js, supervisor.js) and the judge worker (worker.js).
// Keys get the environment prefix from ioredis' keyPrefix; pub/sub channel names don't,
// so the channel includes the prefix explicitly.
const prefix = () => process.env.REDIS_PREFIX || (process.env.RENDER ? 'prod' : 'dev')

module.exports = {
  QUEUE: 'judge:queue',
  HEARTBEAT: 'judge:heartbeat',
  resultKey: (id) => `judge:result:${id}`,
  channel: () => `${prefix()}:judge:done`,
  prefix,
  RESULT_TTL_SECONDS: 600,
  HEARTBEAT_SECONDS: 10,
}
