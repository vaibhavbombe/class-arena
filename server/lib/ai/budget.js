const { getRedis } = require('../redis')

// Daily AI budgets in Redis, shared by every AI feature. Each call counts once against the
// user's own budget for that feature and once against the institute's total.
const DAY_SECONDS = 24 * 60 * 60
const INSTITUTION_PER_DAY = 500

/**
 * @returns null when allowed, 'user' or 'institution' when that budget is used up
 */
async function spendBudget({ feature, userId, institutionId, userLimit }) {
  const redis = getRedis()
  if (!redis) return null
  const day = new Date().toISOString().slice(0, 10)
  const userKey = feature === 'hint' ? `ai:day:${day}:user:${userId}` : `ai:day:${day}:${feature}:user:${userId}`
  const institutionKey = `ai:day:${day}:inst:${institutionId}`
  const [[, userCount], , [, institutionCount]] = await redis.multi()
    .incr(userKey).expire(userKey, DAY_SECONDS)
    .incr(institutionKey).expire(institutionKey, DAY_SECONDS)
    .exec()
  if (userCount > userLimit) return 'user'
  if (institutionCount > INSTITUTION_PER_DAY) return 'institution'
  return null
}

// One request per user every few seconds for a feature (so double clicks don't spend twice).
async function claimCooldown(feature, userId, ms) {
  const redis = getRedis()
  if (!redis) return true
  return Boolean(await redis.set(`rate:${feature}:${userId}`, '1', 'PX', ms, 'NX'))
}

module.exports = { spendBudget, claimCooldown, INSTITUTION_PER_DAY }
