// gym_backend/src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const compression = require('compression');
const responseTime = require('response-time');

dotenv.config();

const app = express();

// Middleware
app.use(compression());
app.use(responseTime((req, res, time) => {
    if (time > 1000) { // Log slow requests (over 1s)
        console.warn(`[SLOW_API] ${req.method} ${req.url} took ${time.toFixed(2)}ms`);
    } else {
        console.log(`${req.method} ${req.url} took ${time.toFixed(2)}ms`);
    }
}));
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Routes
const authRoutes = require('./routes/auth.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const adminRoutes = require('./routes/admin.routes');
const memberRoutes = require('./routes/member.routes');
const staffRoutes = require('./routes/staff.routes');
const trainerRoutes = require('./routes/trainer.routes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/superadmin', superadminRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/member', memberRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/trainer', trainerRoutes);

// Branch Admin Routes
const branchAdminRoutes = require('./routes/branchAdmin.routes');
const crmRoutes = require('./routes/crm.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const financeRoutes = require('./routes/finance.routes');
const lockerRoutes = require('./routes/locker.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const communicationRoutes = require('./routes/communication.routes');
const rewardRoutes = require('./routes/reward.routes');
const feedbackRoutes = require('./routes/feedback.routes');

app.use('/api/v1/branch-admin', branchAdminRoutes);
app.use('/api/v1/crm', crmRoutes);
app.use('/api/v1/equipment', equipmentRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/lockers', lockerRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/communication', communicationRoutes);
app.use('/api/v1/rewards', rewardRoutes);
app.use('/api/v1/feedback', feedbackRoutes);

const referralRoutes = require('./routes/referral.routes');
app.use('/api/v1/referrals', referralRoutes);

const dashboardRoutes = require('./routes/dashboard.routes');
app.use('/api/v1/dashboard', dashboardRoutes);

const storeRoutes = require('./routes/store.routes');
const amenityRoutes = require('./routes/amenity.routes');
const ptRoutes = require('./routes/pt.routes');

const branchesRoutes = require('./routes/branches.routes');
const announcementRoutes = require('./routes/announcement.routes');

app.use('/api/v1/store', storeRoutes);
app.use('/api/v1/amenities', amenityRoutes);
app.use('/api/v1/pt', ptRoutes);
app.use('/api/v1/announcements', announcementRoutes);

app.use('/api/v1/branches', branchesRoutes);

const notificationRoutes = require('./routes/notification.routes');
app.use('/api/v1/notifications', notificationRoutes);

const attendanceRoutes = require('./routes/attendance.routes');
app.use('/api/v1/attendance', attendanceRoutes);

const payrollRoutes = require('./routes/payrollRoutes');
app.use('/api/v1/payroll', payrollRoutes);

// Base Route
app.get('/', (req, res) => {
    res.json({ message: 'Gym CRM API is running' });
});

module.exports = app;

// Restart