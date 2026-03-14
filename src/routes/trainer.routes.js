// gym_backend/src/routes/trainer.routes.js
const express = require('express');
const {
    getProfile,
    updateProfile,
    changePassword,
    updateNotificationSettings,
    getAssignedMembers,
    getMemberById,
    flagMember,
    getSessions,
    createSession,
    updateSessionStatus,
    getTasks,
    updateTaskStatus,
    saveAttendance,
    getSessionHistory,
    getMemberPayments,
    getEarnings,
    updatePayrollStatus,
    getAttendance,
    checkInTrainer,
    requestLeave,
    getAvailability,
    updateAvailability,
    deleteTimeOff,
    getClassesForTrainer,
    getClassByIdForTrainer,
    getDietPlans,
    createDietPlan,
    updateDietPlan,
    toggleDietPlanStatus,
    getWorkoutPlans,
    createWorkoutPlan,
    updateWorkoutPlan,
    toggleWorkoutPlanStatus,
    getTrainerDashboardStats
} = require('../controllers/trainer.controller');
const { getMemberProgressById } = require('../controllers/progress.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('TRAINER')); // Only Trainers can access these routes

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.patch('/profile/notifications', updateNotificationSettings);
router.post('/change-password', changePassword);

// Assigned Members
router.get('/members', getAssignedMembers);
router.get('/members/:id', getMemberById);
router.patch('/members/:id/flag', flagMember);
router.get('/members/:id/payments', getMemberPayments);
router.get('/members/:id/progress', getMemberProgressById);

// Sessions
router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.patch('/sessions/:id/status', updateSessionStatus);
router.post('/sessions/:id/attendance', saveAttendance);
router.get('/session-history', getSessionHistory);

// Tasks
router.get('/tasks', getTasks);
router.patch('/tasks/:id/status', updateTaskStatus);

// Earnings
router.get('/earnings', getEarnings);
router.patch('/payroll/:id/status', updatePayrollStatus);

// Attendance
router.get('/attendance', getAttendance);
router.post('/attendance/check-in', checkInTrainer);
router.post('/attendance/leave', requestLeave);

// Availability
router.get('/availability', getAvailability);
router.patch('/availability', updateAvailability);
router.delete('/availability/time-off/:id', deleteTimeOff);

// Classes (Read-only for trainer)
router.get('/classes', getClassesForTrainer);
router.get('/classes/:id', getClassByIdForTrainer);

// Diet Plans
router.get('/diet-plans', getDietPlans);
router.post('/diet-plans', createDietPlan);
router.patch('/diet-plans/:id', updateDietPlan);
router.patch('/diet-plans/:id/status', toggleDietPlanStatus);

// Workout Plans
router.get('/workout-plans', getWorkoutPlans);
router.post('/workout-plans', createWorkoutPlan);
router.patch('/workout-plans/:id', updateWorkoutPlan);
router.patch('/workout-plans/:id/status', toggleWorkoutPlanStatus);

// Dashboard
router.get('/dashboard-stats', getTrainerDashboardStats);

module.exports = router;
