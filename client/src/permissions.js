// What the signed-in person may do, from /api/me. Only decides what the UI shows; the server
// checks the same permissions on every request.
export function can(me, permission) {
  return Boolean(me?.permissions?.includes(permission))
}
