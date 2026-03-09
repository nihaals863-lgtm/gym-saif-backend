const express = require('express');
const {
    getAllAnnouncements,
    addAnnouncement,
} = require('../controllers/announcement.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER', 'MEMBER'), getAllAnnouncements);
router.post('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER'), addAnnouncement);

module.exports = router;
