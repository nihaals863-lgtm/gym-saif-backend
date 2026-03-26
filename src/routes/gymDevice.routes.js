const express = require('express');
const router = express.Router();
const gymDeviceController = require('../controllers/gymDevice.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/dashboard', protect, gymDeviceController.getDashboardSummary);
router.get('/devices', protect, gymDeviceController.getDeviceList);
router.get('/records', protect, gymDeviceController.getAccessRecords);
router.get('/departments', protect, gymDeviceController.getDepartments);
router.get('/attendance-summary', protect, gymDeviceController.getAttendanceSummary);

module.exports = router;
