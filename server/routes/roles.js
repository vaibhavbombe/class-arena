const express = require('express')
const mongoose = require('mongoose')
const Role = require('../models/Role')
const User = require('../models/User')
const { requireAuth, requirePermission } = require('../middleware/auth')
const permissions = require('../lib/permissions')

// Custom staff roles for the caller's institute. Managing roles is an admin-only power
// (roles.manage can't be put into a custom role), so nobody can grant themselves more access.
const router = express.Router()
router.use(requireAuth, requirePermission('roles.manage'))

const view = (role, memberCount = 0) => ({
  id: role._id, name: role.name, description: role.description, permissions: role.permissions, memberCount, updatedAt: role.updatedAt,
})

// Everything the roles screen needs to draw its checkboxes.
router.get('/catalog', (req, res) => {
  res.json({
    permissions: permissions.ALL.map((name) => ({ name, ...permissions.CATALOG[name], adminOnly: Boolean(permissions.CATALOG[name].adminOnly) })),
    builtIn: { admin: permissions.ALL, teacher: permissions.TEACHER_DEFAULT, student: [] },
  })
})

router.get('/', async (req, res) => {
  const roles = await Role.find({ institutionId: req.institutionId }).sort({ name: 1 })
  const counts = await User.aggregate([
    { $match: { institutionId: new mongoose.Types.ObjectId(req.institutionId), customRoleId: { $in: roles.map((r) => r._id) } } },
    { $group: { _id: '$customRoleId', count: { $sum: 1 } } },
  ])
  const countById = new Map(counts.map((c) => [c._id.toString(), c.count]))
  res.json(roles.map((r) => view(r, countById.get(r.id) || 0)))
})

router.post('/', async (req, res) => {
  const { role, error } = permissions.parseRoleInput(req.body)
  if (error) return res.status(400).json({ error })
  if ((await Role.countDocuments({ institutionId: req.institutionId })) >= permissions.LIMITS.maxRoles) {
    return res.status(400).json({ error: `An institute can have at most ${permissions.LIMITS.maxRoles} custom roles` })
  }
  try {
    const created = await Role.create({ ...role, institutionId: req.institutionId, createdBy: req.userId })
    res.status(201).json(view(created))
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `A role called "${role.name}" already exists` })
    throw err
  }
})

async function findRole(req, id) {
  if (!mongoose.isValidObjectId(id)) return null
  return Role.findOne({ _id: id, institutionId: req.institutionId })
}

// Changes apply to everyone with the role on their next request (permissions are read per request).
router.put('/:id', async (req, res) => {
  const existing = await findRole(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Role not found' })
  const { role, error } = permissions.parseRoleInput(req.body)
  if (error) return res.status(400).json({ error })
  existing.set(role)
  try {
    await existing.save()
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `A role called "${role.name}" already exists` })
    throw err
  }
  res.json(view(existing, await User.countDocuments({ institutionId: req.institutionId, customRoleId: existing._id })))
})

// A role that's still assigned can't be deleted, so nobody's access changes by surprise.
router.delete('/:id', async (req, res) => {
  const role = await findRole(req, req.params.id)
  if (!role) return res.status(404).json({ error: 'Role not found' })
  const assigned = await User.countDocuments({ institutionId: req.institutionId, customRoleId: role._id })
  if (assigned) return res.status(409).json({ error: `${assigned} member${assigned === 1 ? ' has' : 's have'} this role. Assign them another role first.` })
  await Role.deleteOne({ _id: role._id })
  res.json({ message: `Role "${role.name}" deleted` })
})

module.exports = router
