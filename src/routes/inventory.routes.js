const express = require('express');
const {
    getAllInventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    recordUsage,
    receiveStock
} = require('../controllers/inventory.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllInventory);
router.post('/', addInventoryItem);
router.patch('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);
router.post('/usage', recordUsage);
router.post('/restock', receiveStock);

module.exports = router;
