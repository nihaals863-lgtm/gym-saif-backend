const express = require('express');
const router = express.Router();
const gymDeviceController = require('../controllers/gymDevice.controller');
const { handleMipsWebhook } = require('../controllers/mipsWebhook.controller');
const { protect } = require('../middleware/auth.middleware');

// Protected AIoT data routes (branch-aware)
router.get('/dashboard', protect, gymDeviceController.getDashboardSummary);
router.get('/devices', protect, gymDeviceController.getDeviceList);
router.get('/records', protect, gymDeviceController.getAccessRecords);
router.get('/departments', protect, gymDeviceController.getDepartments);
router.get('/attendance-summary', protect, gymDeviceController.getAttendanceSummary);

// Webhook — NO auth (called by MIPS middleware, not browser)
router.post('/webhook', handleMipsWebhook);

module.exports = router;
