const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/manager', protect, dashboardController.getManagerDashboard);
router.get('/staff', protect, dashboardController.getStaffDashboard);
router.get('/trainer', protect, dashboardController.getTrainerDashboard);
router.get('/member', protect, dashboardController.getMemberDashboard);

module.exports = router;
