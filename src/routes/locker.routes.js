const express = require('express');
const {
    getAllLockers,
    getLockerStats,
    addLocker,
    bulkCreateLockers,
    assignLocker,
    releaseLocker,
    toggleMaintenance,
    deleteLocker
} = require('../controllers/locker.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllLockers);
router.get('/stats', getLockerStats);
router.post('/', addLocker);
router.post('/bulk', bulkCreateLockers);
router.patch('/:id/assign', assignLocker);
router.patch('/:id/release', releaseLocker);
router.patch('/:id/maintenance', toggleMaintenance);
router.delete('/:id', deleteLocker);

module.exports = router;
