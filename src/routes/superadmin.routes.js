// gym_backend/src/routes/superadmin.routes.js
const express = require('express');
const {
    getAllGyms,
    addGym,
    updateGym,
    toggleGymStatus,
    deleteGym,
    getAllPlans,
    addPlan,
    updatePlan,
    deletePlan,
    fetchDashboardCards,
    getSubscriptions,
    toggleSubscriptionStatus,
    getPaymentsStats,
    getRevenueData,
    getPayments,
    updatePaymentStatus,
    getWebhookLogs,
    getAuditLogs,
    getActivityLogs,
    getErrorLogs,
    getHardwareLogs,
    getDevices,
    getGlobalSettings,
    updateGlobalSettings,
    getInvoiceSettings,
    updateInvoiceSettings,
    getBookingSettings,
    updateBookingSettings,
    getStaffMembers,
    addStaffMember,
    deleteStaffMember,
    getWalletStats,
    getTrainerRequests,
    getTrainerChangeRequests,
    getPayrollData,
    getStoreDashboardData,
    getProducts,
    getOrders,
    getStoreInventory,
    getInvoices,
    getGSTReports,
    getProfile,
    updateProfile,
    updateTrainerRequest,
    getMemberWallets,
    updateMemberWallet,
    updateStaffMember,
    addDevice,
    updateDevice,
    deleteDevice
} = require('../controllers/superadmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { checkSaaSLimit } = require('../middleware/saas.middleware');

const router = express.Router();

router.use(protect);

// Gyms - Allow both Superadmin and Branch Admin (Branch Admin filtered in controller)
router.get('/gyms', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getAllGyms);
router.post('/gyms', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), checkSaaSLimit('branches'), addGym);
router.patch('/gyms/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), updateGym);
router.delete('/gyms/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), deleteGym);
router.patch('/gyms/:id/toggle-status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), toggleGymStatus);

// Shared Admin/Manager Routes
router.get('/wallet/stats', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getWalletStats);
router.get('/wallet/members', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getMemberWallets);
router.post('/wallet/members/:memberId/transaction', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateMemberWallet);
router.get('/staff', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getStaffMembers);
router.post('/staff', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), addStaffMember);
router.delete('/staff/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), deleteStaffMember);
router.patch('/staff/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), updateStaffMember);

// Devices - Shared
router.get('/devices', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getDevices);
router.post('/devices', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), addDevice);
router.patch('/devices/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateDevice);
router.delete('/devices/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), deleteDevice);


// Restrict all other routes to SUPER_ADMIN only
router.use(authorize('SUPER_ADMIN'));

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

router.get('/plans', getAllPlans);
router.post('/plans', addPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

router.get('/dashboard-cards', fetchDashboardCards);

// Subscriptions
router.get('/subscriptions', getSubscriptions);
router.patch('/subscriptions/:id/toggle-status', toggleSubscriptionStatus);

// Payments & Revenue
router.get('/payments/stats', getPaymentsStats);
router.get('/payments/revenue-chart', getRevenueData);
router.get('/payments', getPayments);
router.patch('/payments/:id/status', updatePaymentStatus);
router.get('/invoices', getInvoices);

// Logs & Reports
router.get('/webhook-logs', getWebhookLogs);
router.get('/audit-logs', getAuditLogs);
router.get('/logs/activity', getActivityLogs);
router.get('/logs/error', getErrorLogs);
router.get('/logs/hardware', getHardwareLogs);
router.get('/reports/gst', getGSTReports);

// Devices & Settings (Now shared for devices)
router.get('/settings/global', getGlobalSettings);
router.patch('/settings/global', updateGlobalSettings);
router.get('/settings/invoice', getInvoiceSettings);
router.patch('/settings/invoice', updateInvoiceSettings);
router.get('/settings/booking', getBookingSettings);
router.patch('/settings/booking', updateBookingSettings);

// Requests
router.get('/requests/trainers', getTrainerRequests);
router.patch('/requests/trainers/:id', updateTrainerRequest);
router.get('/requests/trainer-changes', getTrainerChangeRequests);
router.get('/payroll', getPayrollData);

// Store
router.get('/store/dashboard', getStoreDashboardData);
router.get('/store/products', getProducts);
router.get('/store/orders', getOrders);
router.get('/store/inventory', getStoreInventory);

module.exports = router;
