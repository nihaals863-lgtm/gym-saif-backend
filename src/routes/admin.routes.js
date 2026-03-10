// gym_backend/src/routes/admin.routes.js
const express = require('express');
const { getAuditLogs: getSuperAdminAuditLogs } = require('../controllers/superadmin.controller');
const {
    getAllMembers,
    addMember,
    getMemberById,
    updateMember,
    deleteMember,
    toggleMemberStatus,
    freezeMember,
    unfreezeMember,
    giftDays,
    getAllServiceRequests,
    updateServiceRequestStatus,
    getAllStaff,
    getStaffById,
    createStaff,
    getAvailableUsersForStaff,
    linkStaff,
    fetchBranchDashboardCards,
    getBookings,
    getBookingStats,
    getBookingsByDateRange,
    getBookingById,
    updateBookingStatus,
    createBooking,
    deleteBooking,
    getTodaysBookings,
    getBookingCalendar,
    getCheckIns,
    getRenewalAlerts,
    renewMembership,
    deleteCheckIn,
    getAttendanceStats,
    getLiveCheckIn,
    getTasks,
    getTaskStats,
    updateTaskStatus,
    updateTask,
    createTask,
    getTaskById,
    deleteTask,
    assignTask,
    getBookingReport,
    getAttendanceReport,
    getAllPlans,
    createPlan,
    updatePlan,
    deletePlan,
    getAllClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
    getAnnouncements,
    createAnnouncement,
    getChats,
    getMessages,
    sendMessage,
    createPayroll,
    getPayrollHistory,
    updatePayrollStatus,
    getProfile,
    updateProfile,
    getLeaveRequests,
    updateLeaveStatus,
    getTenantSettings,
    updateTenantSettings,
    getTrainerStats,
    getSystemHealth,
    downloadAttendanceQrCode
} = require('../controllers/admin.controller');
const { getTrainerRequests, updateTrainerRequest, updateStaffMember, deleteStaffMember } = require('../controllers/superadmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { checkSaaSLimit } = require('../middleware/saas.middleware');

const router = express.Router();


router.use(protect);
// Default: BRANCH_ADMIN and MANAGER can access everything
// STAFF gets read-only access to specific routes defined below with inline authorize
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER'));

// Settings
// Settings
// Settings
router.get('/settings/tenant', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getTenantSettings);
router.patch('/settings/tenant', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateTenantSettings);

// Members — STAFF can view only, cannot create/edit/delete
router.get('/members', getAllMembers);
router.get('/members/renewal-alerts', getRenewalAlerts);
router.post('/members', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), checkSaaSLimit('members'), addMember);
router.get('/members/:id', getMemberById);
router.patch('/members/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateMember);
router.delete('/members/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), deleteMember);
router.patch('/members/:id/toggle-status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), toggleMemberStatus);
router.patch('/members/:id/freeze', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), freezeMember);
router.patch('/members/:id/unfreeze', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), unfreezeMember);
router.patch('/members/:id/gift', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), giftDays);
router.post('/members/renewal/renew', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), renewMembership);

// Bookings
router.get('/bookings', getBookings);
router.get('/bookings/stats', getBookingStats);
router.get('/bookings/range', getBookingsByDateRange);
router.get('/bookings/today', getTodaysBookings);
router.get('/bookings/calendar', getBookingCalendar);
router.get('/bookings/:id', getBookingById);
router.patch('/bookings/:id/status', updateBookingStatus);
router.post('/bookings', createBooking);
router.delete('/bookings/:id', deleteBooking);

// Attendance
router.get('/attendance', getCheckIns);
router.get('/attendance/stats', getAttendanceStats);
router.get('/attendance/live', getLiveCheckIn);
router.get('/attendance-qr/download-pdf', downloadAttendanceQrCode);
router.delete('/attendance/:id', deleteCheckIn);

// Tasks
router.get('/tasks', getTasks);
router.get('/tasks/stats', getTaskStats);
router.get('/tasks/:id', getTaskById);
router.patch('/tasks/:id/status', updateTaskStatus);
router.patch('/tasks/:id', updateTask);
router.post('/tasks', createTask);
router.delete('/tasks/:id', deleteTask);
router.post('/tasks/assign', assignTask);

// Reports & Staff
router.get('/reports/bookings', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getBookingReport);
router.get('/reports/attendance', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getAttendanceReport);
router.get('/dashboard-cards', fetchBranchDashboardCards);
router.get('/staff', getAllStaff);
router.get('/staff/available-users', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getAvailableUsersForStaff);
router.get('/staff/trainer-stats', getTrainerStats);
router.get('/staff/:id', getStaffById);
router.post('/staff', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), checkSaaSLimit('staff'), createStaff);
router.post('/staff/link', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), linkStaff);
router.get('/requests/trainers', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getTrainerRequests);
router.patch('/requests/trainers/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateTrainerRequest);
router.patch('/staff/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateStaffMember);
router.delete('/staff/:id', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), deleteStaffMember);

// Service Requests (Members)
router.get('/requests/service', getAllServiceRequests);
router.patch('/requests/service/:id/status', updateServiceRequestStatus);

// Leave Requests (Staff/HR)
router.get('/leave-requests', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getLeaveRequests);
router.patch('/leave-requests/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), updateLeaveStatus);

// Membership Plans
router.get('/plans', getAllPlans);
router.post('/plans', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), createPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// Classes
router.get('/classes', getAllClasses);
router.get('/classes/:id', getClassById);
router.post('/classes', createClass);
router.patch('/classes/:id', updateClass);
router.delete('/classes/:id', deleteClass);

// Communication
router.get('/communication/announcements', getAnnouncements);
router.post('/communication/announcements', createAnnouncement);
router.get('/communication/chats', getChats);
router.get('/communication/chats/:id/messages', getMessages);
router.post('/communication/chats/:id/send', sendMessage);

// Payroll
router.get('/payroll/staff', getAllStaff);
router.post('/payroll', createPayroll);
router.get('/payroll/history', getPayrollHistory);
router.patch('/payroll/:id/status', updatePayrollStatus);

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Audit Logs
router.get('/audit-logs', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getSuperAdminAuditLogs);
router.get('/system-health', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'), getSystemHealth);

module.exports = router;
