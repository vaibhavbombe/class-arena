const mongoose = require('mongoose')
const Class = require('../models/Class')
const Enrollment = require('../models/Enrollment')

// Loads a class the caller is allowed to see, or null. Admins see every class in their
// institute, teachers their own, students only the ones they're enrolled in. Callers answer
// null with 404 (not 403), so ids from other institutes can't be probed.
//
// { read: true } is only passed by endpoints that don't change anything: staff with the
// classes.view_all permission (e.g. a "Head of Department" role) may then look at any class.
// Every write keeps the strict rule, so a read-only role can never modify someone else's class.
async function findVisibleClass(req, classId, { read = false } = {}) {
  if (!mongoose.isValidObjectId(classId)) return null
  const cls = await Class.findOne({ _id: classId, institutionId: req.institutionId })
  if (!cls) return null
  if (req.role === 'admin') return cls
  if (req.role === 'teacher') {
    if (cls.teacherId.toString() === req.userId) return cls
    return read && req.permissions?.includes('classes.view_all') ? cls : null
  }
  const enrolled = await Enrollment.exists({ classId: cls._id, studentId: req.userId })
  return enrolled ? cls : null
}

module.exports = { findVisibleClass }
