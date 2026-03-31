/**
 * device.routes.js
 * Multi-branch device management routes.
 */

const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth.middleware');
const {
    getDevices,
    addDevice,
    updateDevice,
    deleteDevice,
    getMipsConnections,
    upsertMipsConnection,
    deleteMipsConnection,
    openDoor,
    rebootDevice,
} = require('../controllers/device.controller');

// ── Device CRUD ───────────────────────────────────────────────
// GET  /api/v1/devices              → All roles (filtered by branch)
// POST /api/v1/devices              → Admin+ only
// PATCH /api/v1/devices/:id         → Admin+ only
// DELETE /api/v1/devices/:id        → Admin+ only

router.get('/', protect, getDevices);
router.post('/', protect, addDevice);
router.patch('/:id', protect, updateDevice);
router.delete('/:id', protect, deleteDevice);

// ── MIPS Connection Management (SuperAdmin only) ──────────────
// GET  /api/v1/devices/mips-connections
// POST /api/v1/devices/mips-connections
// DELETE /api/v1/devices/mips-connections/:branchId

router.get('/mips-connections', protect, getMipsConnections);
router.post('/mips-connections', protect, upsertMipsConnection);
router.delete('/mips-connections/:branchId', protect, deleteMipsConnection);

// ── Remote Device Actions ─────────────────────────────────────
router.post('/:id/open-door', protect, openDoor);
router.post('/:id/reboot', protect, rebootDevice);

module.exports = router;
