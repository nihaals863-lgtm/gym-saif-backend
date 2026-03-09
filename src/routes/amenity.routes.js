const express = require('express');
const router = express.Router();
const amenityController = require('../controllers/amenity.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// All amenity routes require authentication
router.use(protect);

// Get all amenities (for current tenant)
router.get('/', amenityController.getAmenities);

// Management routes (Admins and Managers)
router.post('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), amenityController.addAmenity);
router.patch('/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), amenityController.updateAmenity);
router.delete('/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), amenityController.deleteAmenity);

module.exports = router;
