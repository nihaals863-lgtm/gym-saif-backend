// gym_backend/src/routes/auth.routes.js
const express = require('express');
const { login, logout, getMe, updateProfile } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);

module.exports = router;
