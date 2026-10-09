const mongoose = require('mongoose')
const Class = require('../models/Class')
const Enrollment = require('../models/Enrollment')

// Loads a class the caller is allowed to see, or null. Admins see every class in
// their institute, teachers only their own, students only ones they're enrolled in.
// Callers answer null with 404 (not 403), so ids from other institutes can't be probed.
async function findVisibleClass(req, classId) {
  if (!mongoose.isValidObjectId(classId)) return null
  const cls = await Class.findOne({ _id: classId, institutionId: req.institutionId })
  if (!cls) return null
  if (req.role === 'admin') return cls
  if (req.role === 'teacher') return cls.teacherId.toString() === req.userId ? cls : null
  const enrolled = await Enrollment.exists({ classId: cls._id, studentId: req.userId })
  return enrolled ? cls : null
}

module.exports = { findVisibleClass }
