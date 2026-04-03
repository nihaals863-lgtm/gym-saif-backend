// gym_backend/src/routes/staff.routes.js
const express = require('express');
const {
    searchMembers,
    searchAllForAttendance,
    checkIn,
    checkOut,
    getMyAttendance,
    recordAttendance,
    getTasks,
    getTaskById,
    createTask,
    getTaskStats,
    updateTaskStatus,
    deleteTask,
    getBranchTeam,
    getMyBranch,
    getLockers,
    assignLocker,
    releaseLocker,
    addLocker,
    getPaymentHistory,
    collectPayment,
    getMembers,
    getMemberById,
    addMember,
    getAttendanceReport,
    getBookingReport,
    getTodaysCheckIns,
    bulkCreateLockers,
    getAttendanceHistory
} = require('../controllers/staff.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('STAFF', 'TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'));

// Members
router.get('/members', getMembers);
router.post('/members', addMember);
router.get('/members/search', searchMembers);
router.get('/attendance/search-all', searchAllForAttendance);
router.get('/members/:id', getMemberById);

// Attendance
router.get('/attendance/today', getTodaysCheckIns);
router.get('/attendance/me', getMyAttendance);
router.post('/attendance/record', recordAttendance);
router.post('/attendance/check-in', checkIn);
router.post('/attendance/check-out', checkOut);

// Tasks
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.get('/tasks/stats', getTaskStats);
router.get('/tasks/:id', getTaskById);
router.patch('/tasks/:id/status', updateTaskStatus);
router.delete('/tasks/:id', deleteTask);
router.get('/team', getBranchTeam);
router.get('/my-branch', getMyBranch);

// Lockers
router.get('/lockers', getLockers);
router.post('/lockers', addLocker);
router.post('/lockers/bulk', bulkCreateLockers);
router.post('/lockers/:id/assign', assignLocker);
router.post('/lockers/:id/release', releaseLocker);

// Payments
router.get('/payments', getPaymentHistory);
router.post('/payments', collectPayment);

// Reports
router.get('/reports/attendance', getAttendanceReport);
router.get('/reports/bookings', getBookingReport);
router.get('/attendance/history', getAttendanceHistory);

module.exports = router;
