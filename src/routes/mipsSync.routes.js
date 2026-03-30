const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
    syncMember,
    syncStaff,
    revokeMember,
    restoreMember,
    getMemberSyncStatus,
    getStaffSyncStatus,
} = require('../controllers/mipsSync.controller');

// Sync member/staff to MIPS + push to devices
router.post('/member/:memberId', protect, syncMember);
router.post('/staff/:userId', protect, syncStaff);

// Revoke / restore hardware access
router.post('/revoke/:memberId', protect, revokeMember);
router.post('/restore/:memberId', protect, restoreMember);

// Sync status
router.get('/status/member/:memberId', protect, getMemberSyncStatus);
router.get('/status/staff/:userId', protect, getStaffSyncStatus);

module.exports = router;
