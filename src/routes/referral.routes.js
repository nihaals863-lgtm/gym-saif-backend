const express = require('express');
const {
    getAllReferrals,
    createReferral,
    verifyCode
} = require('../controllers/referral.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllReferrals);
router.post('/', createReferral);
router.get('/verify/:code', verifyCode);

module.exports = router;
