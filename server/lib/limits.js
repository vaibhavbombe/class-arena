// Every rate limit in one place (see lib/rateLimit.js for how they're counted).
// Per-IP limits are deliberately generous: a whole school can share one public IP, so they
// only stop floods from one source. Guessing is stopped by the failure limits, which count
// wrong passwords, join codes and PINs per account or per user.
const MIN = 60

module.exports = {
  login: {
    perIp: { name: 'login-ip', limit: 200, windowSec: 15 * MIN },
    // Wrong passwords for one account from one IP: stops guessing from a single source.
    failuresPerAccountAndIp: { name: 'login-fail', limit: 10, windowSec: 15 * MIN },
    // Wrong passwords for one account from anywhere: slows guessing spread over many IPs,
    // high enough that someone else can't easily lock a real user out.
    failuresPerAccount: { name: 'login-fail-any', limit: 50, windowSec: 60 * MIN },
  },
  signup: { perIp: { name: 'signup-ip', limit: 10, windowSec: 60 * MIN } },
  studentSignup: {
    perIp: { name: 'student-signup-ip', limit: 200, windowSec: 60 * MIN },
    wrongCodesPerIp: { name: 'join-code-fail-ip', limit: 20, windowSec: 15 * MIN },
  },
  classJoin: { wrongCodesPerUser: { name: 'join-code-fail-user', limit: 10, windowSec: 15 * MIN } },
  refresh: { perIp: { name: 'refresh-ip', limit: 1000, windowSec: 15 * MIN } },
  forgotPassword: { perIp: { name: 'forgot-ip', limit: 20, windowSec: 60 * MIN } },
  resetPassword: { perIp: { name: 'reset-ip', limit: 30, windowSec: 15 * MIN } },
  inviteAccept: { perIp: { name: 'invite-accept-ip', limit: 30, windowSec: 15 * MIN } },
  gamePin: { wrongPinsPerUser: { name: 'pin-fail-user', limit: 20, windowSec: 10 * MIN } },
  // A 6-digit code is a 1-in-a-million guess; 10 tries per 15 minutes keeps guessing hopeless.
  mfa: { wrongCodesPerUser: { name: 'mfa-fail-user', limit: 10, windowSec: 15 * MIN } },
}
