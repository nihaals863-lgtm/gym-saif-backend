const express = require('express');
const {
    getAllFeedback,
    addFeedback,
    updateFeedbackStatus,
    publishToGoogle
} = require('../controllers/feedback.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'MEMBER'), getAllFeedback);
router.post('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'MEMBER'), addFeedback);
router.patch('/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'), updateFeedbackStatus);
router.patch('/:id/publish', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'), publishToGoogle);

module.exports = router;
