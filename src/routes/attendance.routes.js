const express = require('express');
const router = express.Router();
const { scanCheckIn } = require('../controllers/attendance.controller');
const { protect } = require('../middleware/auth.middleware');

// Apply protection to all attendance routes
router.use(protect);

router.post('/scan-checkin', scanCheckIn);

module.exports = router;
