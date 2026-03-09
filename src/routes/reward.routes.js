const express = require('express');
const {
    getAllRewards,
    addReward,
} = require('../controllers/reward.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllRewards);
router.post('/', addReward);

module.exports = router;
