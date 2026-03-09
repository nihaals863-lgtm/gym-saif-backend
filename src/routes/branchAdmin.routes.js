const express = require('express');
const {
    getDashboardStats,
    getRecentActivities,
    getTrainerAvailability,
    getFinancialStats,
    getRevenueReport,
    getMembershipReport,
    getLeadConversionReport,
    getExpenseReport,
    getPerformanceReport,
    getAttendanceReport,
    getBookingReport,
    getLiveAccess,
    getRenewalAlerts
} = require('../controllers/branchAdmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'));

router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activities', getRecentActivities);
router.get('/dashboard/trainers', getTrainerAvailability);
router.get('/dashboard/financials', getFinancialStats);
router.get('/reports/revenue', getRevenueReport);
router.get('/reports/membership', getMembershipReport);
router.get('/reports/lead-conversion', getLeadConversionReport);
router.get('/reports/expenses', getExpenseReport);
router.get('/reports/performance', getPerformanceReport);
router.get('/reports/attendance', getAttendanceReport);
router.get('/reports/bookings', getBookingReport);
router.get('/dashboard/live-access', getLiveAccess);
router.get('/dashboard/renewal-alerts', getRenewalAlerts);

module.exports = router;
