const express = require('express');
const {
    getAllReferrals,
    createReferral,
    verifyCode,
    claimReward
} = require('../controllers/referral.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', getAllReferrals);
router.post('/', createReferral);
router.get('/verify/:code', verifyCode);
router.patch('/:id/claim', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), claimReward);

module.exports = router;
