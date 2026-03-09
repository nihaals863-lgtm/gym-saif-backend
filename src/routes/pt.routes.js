const express = require('express');
const router = express.Router();
const ptController = require('../controllers/pt.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

// Stats
router.get('/stats', ptController.getPTStats);

// Packages
router.post('/packages', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), ptController.createPackage);
router.get('/packages', ptController.getPackages);
router.put('/packages/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), ptController.updatePackage);
router.delete('/packages/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), ptController.deletePackage);

// Accounts (Purchases)
router.post('/purchase', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'), ptController.purchasePackage);
router.get('/accounts', ptController.getActiveAccounts);

// Sessions
router.post('/sessions', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER'), ptController.logSession);
router.get('/sessions', ptController.getSessions);

module.exports = router;
