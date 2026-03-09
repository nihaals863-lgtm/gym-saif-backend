const express = require('express');
const {
    getProducts, checkout, getOrders, getOrderById, updateStock, addProduct, updateProduct, deleteProduct,
    getCoupons, createCoupon, updateCoupon, deleteCoupon, getCouponStats,
    getCategories, createCategory, updateCategory, deleteCategory, getStoreStats
} = require('../controllers/store.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

const adminStaffOnly = authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF');

router.get('/stats', adminStaffOnly, getStoreStats);

// Products
router.get('/products', getProducts);
router.post('/products', adminStaffOnly, addProduct);
router.patch('/products/:id/stock', adminStaffOnly, updateStock);
router.put('/products/:id', adminStaffOnly, updateProduct);
router.delete('/products/:id', adminStaffOnly, deleteProduct);

// Orders
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderById);
router.post('/checkout', checkout);

// Coupons
router.get('/coupons', getCoupons);
router.get('/coupons/stats', adminStaffOnly, getCouponStats);
router.post('/coupons', adminStaffOnly, createCoupon);
router.put('/coupons/:id', adminStaffOnly, updateCoupon);
router.delete('/coupons/:id', adminStaffOnly, deleteCoupon);

// Categories
router.get('/categories', getCategories);
router.post('/categories', adminStaffOnly, createCategory);
router.put('/categories/:id', adminStaffOnly, updateCategory);
router.delete('/categories/:id', adminStaffOnly, deleteCategory);

module.exports = router;
