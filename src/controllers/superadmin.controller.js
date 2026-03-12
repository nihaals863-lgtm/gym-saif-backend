// gym_backend/src/controllers/superadmin.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { logWebhook } = require('../utils/webhookLogger');

// --- GYM MANAGEMENT ---

const getAllGyms = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        const constraints = [];
        if (status && status !== 'All') {
            constraints.push({ status });
        }

        if (search) {
            constraints.push({
                OR: [
                    { name: { contains: search } },
                    { branchName: { contains: search } },
                    { owner: { contains: search } }
                ]
            });
        }

        // Restriction for SaaS: Branch Admin sees all branches they own
        if (req.user.role === 'BRANCH_ADMIN') {
            constraints.push({
                OR: [
                    { id: req.user.tenantId },
                    { owner: req.user.email },
                    { owner: req.user.name }
                ]
            });
        } else if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId) {
            constraints.push({ id: req.user.tenantId });
        }

        if (constraints.length > 0) {
            where.AND = constraints;
        }

        const [gyms, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { users: { where: { role: 'MEMBER' } } }
                    },
                    subscriptions: {
                        where: { status: 'Active' },
                        include: { plan: true },
                        take: 1
                    }
                }
            }),
            prisma.tenant.count({ where })
        ]);

        const formattedGyms = gyms.map(g => ({
            id: g.id,
            gymName: g.name,
            branchName: g.branchName,
            owner: g.owner,
            managerName: g.managerName,
            managerEmail: g.managerEmail,
            phone: g.phone,
            location: g.location,
            status: g.status,
            members: g._count.users,
            planId: g.subscriptions[0]?.planId,
            planName: g.subscriptions[0]?.plan?.name || 'No Plan',
            createdAt: g.createdAt
        }));

        res.json({
            gyms: formattedGyms,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / take)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addGym = async (req, res) => {
    try {
        const { gymName, branchName, owner, email, phone, location, planId } = req.body;
        let effectivePlanId = planId;

        // If a Branch Admin is adding a branch, they inherit their current plan
        if (!effectivePlanId && req.user.role === 'BRANCH_ADMIN') {
            const currentSub = await prisma.subscription.findFirst({
                where: { tenantId: req.user.tenantId, status: 'Active' }
            });
            if (currentSub) {
                effectivePlanId = currentSub.planId;
            }
        }

        if (!effectivePlanId) {
            const firstPlan = await prisma.saaSPlan.findFirst({ where: { status: 'Active' } });
            if (firstPlan) {
                effectivePlanId = firstPlan.id;
            } else {
                return res.status(400).json({ message: 'SaaS Plan is required. No active plans found in system.' });
            }
        }

        const plan = await prisma.saaSPlan.findUnique({ where: { id: parseInt(effectivePlanId) } });
        if (!plan) return res.status(404).json({ message: 'SaaS Plan not found' });

        // Use a transaction to ensure Tenant, User, and Subscription are created
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Tenant (Gym)
            const tenant = await tx.tenant.create({
                data: {
                    name: gymName,
                    branchName,
                    // Visibility logic: If a Branch Admin creates it, they are the 'owner' for filtering/limits
                    owner: req.user.role === 'BRANCH_ADMIN' ? req.user.email : (owner || email.split('@')[0]),
                    managerName: owner || email.split('@')[0],
                    managerEmail: email,
                    phone,
                    location,
                    status: 'Active'
                }
            });

            // 2. Assign or Create the Branch Admin/Manager User
            const existingUser = await tx.user.findUnique({ where: { email } });
            let user;
            if (existingUser) {
                user = await tx.user.update({
                    where: { id: existingUser.id },
                    data: {
                        tenantId: tenant.id,
                        role: existingUser.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'MANAGER'
                    }
                });
            } else {
                const hashedPassword = await bcrypt.hash('123456', 10);
                user = await tx.user.create({
                    data: {
                        email,
                        password: hashedPassword,
                        name: owner || email.split('@')[0],
                        role: req.user.role === 'SUPER_ADMIN' ? 'BRANCH_ADMIN' : 'MANAGER',
                        tenantId: tenant.id,
                        status: 'Active'
                    }
                });
            }

            // 3. Create the Subscription
            const startDate = new Date();
            const endDate = new Date();
            if (plan.period === 'Monthly') {
                endDate.setMonth(endDate.getMonth() + 1);
            } else if (plan.period === 'Yearly') {
                endDate.setFullYear(endDate.getFullYear() + 1);
            }

            await tx.subscription.create({
                data: {
                    tenantId: tenant.id,
                    planId: plan.id,
                    subscriber: owner || email.split('@')[0],
                    startDate,
                    endDate,
                    status: 'Active',
                    paymentStatus: 'Paid'
                }
            });

            return { tenant, user };
        });

        await logWebhook('GYM_REGISTERED', 'POST', '/api/superadmin/gyms', 201, result.tenant);
        res.status(201).json(result.tenant);
    } catch (error) {
        console.error('Add Gym Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateGym = async (req, res) => {
    try {
        const { id } = req.params;
        const { gymName, branchName, ownerName, email, phone, address, status, owner, location, planId } = req.body;
        
        const data = {};
        if (gymName !== undefined) data.name = gymName;
        if (branchName !== undefined) data.branchName = branchName;
        if (owner !== undefined) data.owner = owner;
        if (ownerName !== undefined) data.managerName = ownerName;
        if (email !== undefined) data.managerEmail = email;
        if (phone !== undefined) data.phone = phone;
        if (location !== undefined) data.location = location;
        if (address !== undefined && location === undefined) data.location = address;
        if (status !== undefined) data.status = status;

        const updatedGym = await prisma.tenant.update({
            where: { id: parseInt(id) },
            data
        });

        if (planId) {
            const existingSub = await prisma.subscription.findFirst({
                where: { tenantId: parseInt(id), status: 'Active' }
            });

            if (existingSub) {
                await prisma.subscription.update({
                    where: { id: existingSub.id },
                    data: { planId: parseInt(planId) }
                });
            } else {
                const plan = await prisma.saaSPlan.findUnique({ where: { id: parseInt(planId) } });
                if (plan) {
                    const startDate = new Date();
                    const endDate = new Date();
                    if (plan.period === 'Monthly') {
                        endDate.setMonth(endDate.getMonth() + 1);
                    } else if (plan.period === 'Yearly') {
                        endDate.setFullYear(endDate.getFullYear() + 1);
                    }

                    await prisma.subscription.create({
                        data: {
                            tenantId: parseInt(id),
                            planId: parseInt(planId),
                            subscriber: ownerName || updatedGym.owner || updatedGym.name,
                            startDate,
                            endDate,
                            status: 'Active',
                            paymentStatus: 'Paid'
                        }
                    });
                }
            }
        }
        res.json(updatedGym);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleGymStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const gym = await prisma.tenant.findUnique({ where: { id: parseInt(id) } });
        const updated = await prisma.tenant.update({
            where: { id: parseInt(id) },
            data: { status: gym.status === 'Active' ? 'Suspended' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteGym = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = parseInt(id);

        if (isNaN(tenantId)) {
            return res.status(400).json({ message: 'Invalid ID' });
        }

        // Use transaction for cascading delete
        await prisma.$transaction(async (tx) => {
            // Delete related data first
            // 1. Users (Staff, Members, etc.)
            await tx.user.deleteMany({ where: { tenantId } });

            // 2. Members (Profile data)
            await tx.member.deleteMany({ where: { tenantId } });

            // 3. Plans
            await tx.membershipPlan.deleteMany({ where: { tenantId } });

            // 4. Classes & Bookings (Classes depend on Tenant, Bookings depend on Class/Member)
            // Delete bookings first if we were being strict, but deleteMany on classes might cascade if configured in DB, 
            // but Prisma requires manual deletion if relation is not set to Cascade in schema.
            // For now, let's assume Members and Users are the main blockers.
            // We should also delete other related models if they exist:
            // Leads, Inventory, Lockers, Equipment, Invoices, Expenses, Payroll, etc.

            await tx.lead.deleteMany({ where: { tenantId } });
            await tx.inventory.deleteMany({ where: { tenantId } });
            await tx.locker.deleteMany({ where: { tenantId } });
            await tx.equipment.deleteMany({ where: { tenantId } });
            await tx.invoice.deleteMany({ where: { tenantId } });
            await tx.expense.deleteMany({ where: { tenantId } });
            await tx.payroll.deleteMany({ where: { tenantId } });

            // Finally delete the Tenant
            await tx.tenant.delete({ where: { id: tenantId } });
        });

        res.json({ message: 'Gym and all related data deleted successfully' });
    } catch (error) {
        console.error('Delete Gym Error:', error);
        res.status(500).json({ message: error.message || 'Failed to delete gym' });
    }
};

// --- PLAN MANAGEMENT ---

const getAllPlans = async (req, res) => {
    try {
        const plans = await prisma.saaSPlan.findMany();
        const parsed = plans.map(p => ({
            ...p,
            features: p.features ? JSON.parse(p.features) : [],
            limits: p.limits ? JSON.parse(p.limits) : null,
            opsLimits: p.opsLimits ? JSON.parse(p.opsLimits) : null,
            benefits: p.benefits ? JSON.parse(p.benefits) : []
        }));
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addPlan = async (req, res) => {
    try {
        const { name, price, period, features, limits, opsLimits, benefits, status, description } = req.body;
        const newPlan = await prisma.saaSPlan.create({
            data: {
                name,
                price: parseFloat(price),
                period,
                description,
                status: status || 'Active',
                features: features ? JSON.stringify(features) : null,
                limits: limits ? JSON.stringify(limits) : null,
                opsLimits: opsLimits ? JSON.stringify(opsLimits) : null,
                benefits: benefits ? JSON.stringify(benefits) : null
            }
        });
        await logWebhook('PLAN_CREATED', 'POST', '/api/superadmin/plans', 201, newPlan);
        res.status(201).json(newPlan);
    } catch (error) {
        console.error('Add Plan Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, period, features, limits, opsLimits, benefits, status, description } = req.body;
        const data = {};
        if (name !== undefined) data.name = name;
        if (price !== undefined) data.price = parseFloat(price);
        if (period !== undefined) data.period = period;
        if (description !== undefined) data.description = description;
        if (status !== undefined) data.status = status;
        if (features !== undefined) data.features = JSON.stringify(features);
        if (limits !== undefined) data.limits = JSON.stringify(limits);
        if (opsLimits !== undefined) data.opsLimits = JSON.stringify(opsLimits);
        if (benefits !== undefined) data.benefits = JSON.stringify(benefits);

        const updatedPlan = await prisma.saaSPlan.update({
            where: { id: parseInt(id) },
            data
        });
        res.json(updatedPlan);
    } catch (error) {
        console.error('Update Plan Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.saaSPlan.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LOGS & STATS ---

const fetchDashboardCards = async (req, res) => {
    try {
        // Date boundaries for current and previous month
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        // --- TOTAL GYMS ---
        const totalGyms = await prisma.tenant.count();
        const gymsThisMonth = await prisma.tenant.count({
            where: { createdAt: { gte: currentMonthStart } }
        });
        const gymsLastMonth = await prisma.tenant.count({
            where: { createdAt: { gte: previousMonthStart, lte: previousMonthEnd } }
        });
        const gymsTrend = gymsThisMonth > 0 ? `+${gymsThisMonth} this month` : '0 new this month';
        const gymsTrendDirection = gymsThisMonth > gymsLastMonth ? 'up' : gymsThisMonth < gymsLastMonth ? 'down' : 'stable';

        // --- TOTAL MEMBERS ---
        const totalMembers = await prisma.user.count({ where: { role: 'MEMBER' } });
        const membersThisMonth = await prisma.user.count({
            where: { role: 'MEMBER', joinedDate: { gte: currentMonthStart } }
        });
        const membersLastMonth = await prisma.user.count({
            where: { role: 'MEMBER', joinedDate: { gte: previousMonthStart, lte: previousMonthEnd } }
        });
        let membersTrend;
        let membersTrendDirection;
        if (membersLastMonth === 0) {
            membersTrend = membersThisMonth > 0 ? `+${membersThisMonth} new` : 'No change';
            membersTrendDirection = membersThisMonth > 0 ? 'up' : 'stable';
        } else {
            const memberChange = Math.round(((membersThisMonth - membersLastMonth) / membersLastMonth) * 100);
            membersTrend = memberChange >= 0 ? `+${memberChange}% vs last month` : `${memberChange}% vs last month`;
            membersTrendDirection = memberChange > 0 ? 'up' : memberChange < 0 ? 'down' : 'stable';
        }

        // --- ACTIVE PLANS (retention) ---
        const activeSubs = await prisma.subscription.count({ where: { status: 'Active' } });
        const totalSubs = await prisma.subscription.count();
        const retentionRate = totalSubs > 0 ? Math.round((activeSubs / totalSubs) * 100) : 0;
        const plansTrend = `${retentionRate}% retention`;
        const plansTrendDirection = retentionRate >= 80 ? 'up' : retentionRate >= 50 ? 'stable' : 'down';

        // --- MONTHLY REVENUE ---
        const currentMonthRevenue = await prisma.saasPayment.aggregate({
            _sum: { amount: true },
            where: { status: 'Success', date: { gte: currentMonthStart } }
        });
        const lastMonthRevenue = await prisma.saasPayment.aggregate({
            _sum: { amount: true },
            where: { status: 'Success', date: { gte: previousMonthStart, lte: previousMonthEnd } }
        });
        const currentRev = currentMonthRevenue._sum.amount ? parseFloat(currentMonthRevenue._sum.amount) : 0;
        const lastRev = lastMonthRevenue._sum.amount ? parseFloat(lastMonthRevenue._sum.amount) : 0;
        const totalRevenueAll = await prisma.saasPayment.aggregate({
            _sum: { amount: true },
            where: { status: 'Success' }
        });
        const revenueValue = totalRevenueAll._sum.amount ? parseFloat(totalRevenueAll._sum.amount) : 0;

        let revenueTrend;
        let revenueTrendDirection;
        if (lastRev === 0) {
            revenueTrend = currentRev > 0 ? `+₹${currentRev.toLocaleString()} this month` : 'No revenue yet';
            revenueTrendDirection = currentRev > 0 ? 'up' : 'stable';
        } else {
            const revChange = Math.round(((currentRev - lastRev) / lastRev) * 100);
            revenueTrend = revChange >= 0 ? `+${revChange}% vs last month` : `${revChange}% vs last month`;
            revenueTrendDirection = revChange > 0 ? 'up' : revChange < 0 ? 'down' : 'stable';
        }

        res.json([
            { id: 1, title: 'Total Gyms', value: totalGyms.toString(), trend: gymsTrend, trendDirection: gymsTrendDirection, color: gymsTrendDirection === 'up' ? 'primary' : gymsTrendDirection === 'down' ? 'danger' : 'info' },
            { id: 2, title: 'Total Members', value: totalMembers.toLocaleString(), trend: membersTrend, trendDirection: membersTrendDirection, color: membersTrendDirection === 'up' ? 'success' : membersTrendDirection === 'down' ? 'danger' : 'info' },
            { id: 3, title: 'Active Plans', value: activeSubs.toString(), trend: plansTrend, trendDirection: plansTrendDirection, color: plansTrendDirection === 'up' ? 'success' : plansTrendDirection === 'down' ? 'danger' : 'warning' },
            { id: 4, title: 'Monthly Revenue', value: `₹${revenueValue.toLocaleString()}`, trend: revenueTrend, trendDirection: revenueTrendDirection, color: revenueTrendDirection === 'up' ? 'success' : revenueTrendDirection === 'down' ? 'danger' : 'info' }
        ]);
    } catch (error) {
        console.error('Dashboard Cards Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// --- SUBSCRIPTIONS ---

const getSubscriptions = async (req, res) => {
    try {
        const subs = await prisma.subscription.findMany();
        const tenants = await prisma.tenant.findMany();
        const plans = await prisma.saaSPlan.findMany();

        const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
        const planMap = Object.fromEntries(plans.map(p => [p.id, p.name]));

        const formatted = subs.map(s => ({
            ...s,
            gym: tenantMap[s.tenantId] || 'Unknown Gym',
            plan: planMap[s.planId] || 'Unknown Plan'
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleSubscriptionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.subscription.findUnique({ where: { id } });
        const updated = await prisma.subscription.update({
            where: { id },
            data: { status: sub.status === 'Active' ? 'Suspended' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- PAYMENTS ---

const getPaymentsStats = async (req, res) => {
    try {
        const total = await prisma.saasPayment.aggregate({ _sum: { amount: true } });
        res.json({ total: total._sum.amount || 0, growth: '+0%', pending: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getRevenueData = async (req, res) => {
    try {
        const payments = await prisma.saasPayment.findMany({
            where: { status: 'Success' },
            orderBy: { date: 'asc' },
            take: 12
        });

        const chartData = payments.map(p => ({
            month: p.date.toLocaleString('default', { month: 'short' }),
            revenue: parseFloat(p.amount)
        }));

        res.json(chartData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPayments = async (req, res) => {
    try {
        const payments = await prisma.saasPayment.findMany();
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.saasPayment.update({
            where: { id },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoices = async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({ include: { tenant: true } });
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LOGS & REPORTS ---

const getWebhookLogs = async (req, res) => {
    try {
        const logs = await prisma.webhookLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        // Calculate stats
        const totalEvents = await prisma.webhookLog.count();
        const successCount = await prisma.webhookLog.count({ where: { status: 'success' } });
        const failedLast24h = await prisma.webhookLog.count({
            where: {
                status: 'failed',
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
        });
        const activeWebhooks = 8; // Keep this static as requested or fetch if model exists

        const stats = {
            totalEvents: totalEvents.toLocaleString(),
            successRate: totalEvents > 0 ? ((successCount / totalEvents) * 100).toFixed(1) + '%' : '0%',
            failedLast24h,
            activeWebhooks
        };

        res.json({ logs, stats });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAuditLogs = async (req, res) => {
    try {
        const { branchId, search, action, module: moduleName, from, to, page = 1, limit = 50 } = req.query;
        const { role, tenantId: userTenantId } = req.user;

        let userIdFilter = undefined;

        // Determine which users to include based on branch
        if (role !== 'SUPER_ADMIN' || (branchId && branchId !== 'all')) {
            const targetTenantId = (branchId && branchId !== 'all') ? parseInt(branchId) : userTenantId;
            if (targetTenantId) {
                const branchUsers = await prisma.user.findMany({
                    where: { tenantId: targetTenantId },
                    select: { id: true }
                });
                userIdFilter = branchUsers.map(u => u.id);
            }
        }

        let where = {};
        if (userIdFilter !== undefined) {
            where.userId = { in: userIdFilter };
        }

        // Search across action, affectedEntity, details
        if (search && search.trim() !== '') {
            where.OR = [
                { action: { contains: search } },
                { affectedEntity: { contains: search } },
                { details: { contains: search } },
                { module: { contains: search } },
            ];
        }

        if (action && action !== 'All Actions') {
            where.action = action;
        }

        if (moduleName && moduleName !== 'All Modules') {
            where.module = moduleName;
        }

        // Date filters
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = toDate;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
                include: {
                    // AuditLog doesn't have a direct user relation in schema, so we use raw user lookup
                }
            }),
            prisma.auditLog.count({ where })
        ]);

        // Get today's activity count
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await prisma.auditLog.count({
            where: { ...where, createdAt: { gte: todayStart } }
        });

        // Get most active user (by userId)
        const activityByUser = await prisma.auditLog.groupBy({
            by: ['userId'],
            where,
            _count: { userId: true },
            orderBy: { _count: { userId: 'desc' } },
            take: 1
        });

        let mostActiveUser = 'N/A';
        if (activityByUser.length > 0) {
            const topUser = await prisma.user.findUnique({
                where: { id: activityByUser[0].userId },
                select: { name: true, email: true }
            });
            mostActiveUser = topUser?.name || topUser?.email || `User #${activityByUser[0].userId}`;
        }

        // Get distinct actions and modules for filter dropdowns
        const distinctActions = await prisma.auditLog.findMany({
            where: userIdFilter !== undefined ? { userId: { in: userIdFilter } } : {},
            select: { action: true },
            distinct: ['action']
        });
        const distinctModules = await prisma.auditLog.findMany({
            where: userIdFilter !== undefined ? { userId: { in: userIdFilter } } : {},
            select: { module: true },
            distinct: ['module']
        });

        // Enrich logs with user names
        const userIds = [...new Set(logs.map(l => l.userId))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, role: true, tenantId: true }
        });
        const userMap = Object.fromEntries(users.map(u => [u.id, u]));

        // Get tenant names
        const tenantIds = [...new Set(users.filter(u => u.tenantId).map(u => u.tenantId))];
        const tenants = await prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true }
        });
        const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: userMap[log.userId] ? {
                name: userMap[log.userId].name,
                email: userMap[log.userId].email,
                role: userMap[log.userId].role,
                branch: tenantMap[userMap[log.userId].tenantId] || 'Main'
            } : null
        }));

        res.json({
            logs: enrichedLogs,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            stats: {
                total,
                today: todayCount,
                mostActive: mostActiveUser
            },
            filters: {
                actions: distinctActions.map(a => a.action).filter(Boolean),
                modules: distinctModules.map(m => m.module).filter(Boolean)
            }
        });
    } catch (error) {
        console.error('Audit logs error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getActivityLogs = async (req, res) => {
    // Alias for audit logs with specific filter if needed
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: { not: 'System' } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getErrorLogs = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: 'Error' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getHardwareLogs = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: 'Hardware' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getGSTReports = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        const gstPercent = settings?.gstPercent || 18.00;

        const payments = await prisma.saasPayment.findMany({
            where: { status: 'Success' },
            include: {} // saasPayment doesn't have relation to tenant in schema, but has tenantId
        });

        const reports = payments.map(p => {
            const amount = parseFloat(p.amount);
            const gstAmount = (amount * (parseFloat(gstPercent) / 100)).toFixed(2);
            return {
                id: p.id,
                invoiceNo: `INV-${p.paymentId.slice(-4)}`,
                gymName: p.tenantName,
                amount: `₹${amount}`,
                gstPercent: `${gstPercent}%`,
                gstAmount: `₹${gstAmount}`,
                date: p.date.toISOString().split('T')[0]
            };
        });

        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- DEVICES & SETTINGS ---

const getDevices = async (req, res) => {
    try {
        const { tenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let where = {};
        if (role !== 'SUPER_ADMIN') {
            // Logic for BRANCH_ADMIN and MANAGER
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: tenantId || undefined },
                        { owner: email || undefined },
                        { owner: userName || undefined }
                    ].filter(cond => Object.values(cond)[0] !== undefined)
                },
                select: { id: true }
            });
            const managedBranchIds = branches.map(b => b.id);

            if (headerTenantId && headerTenantId !== 'all') {
                const hId = parseInt(headerTenantId);
                if (managedBranchIds.includes(hId)) {
                    where.tenantId = hId;
                } else {
                    where.tenantId = { in: managedBranchIds };
                }
            } else {
                where.tenantId = { in: managedBranchIds };
            }
        } else {
            // Logic for SUPER_ADMIN
            if (headerTenantId && headerTenantId !== 'all') {
                where.tenantId = parseInt(headerTenantId);
            }
        }

        const devices = await prisma.device.findMany({
            where,
            orderBy: { lastSeen: 'desc' }
        });
        res.json(devices);
    } catch (error) {
        console.error('getDevices Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const addDevice = async (req, res) => {
    try {
        const { name, type, ip, status, branchId } = req.body;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;

        // Logic to determine target branches
        let targetBranchIds = [];
        // Prioritize explicit branchId from body, then fallback to header
        const effectiveBranchId = branchId || req.headers['x-tenant-id'];

        if (effectiveBranchId === 'all') {
            const branches = await prisma.tenant.findMany({
                where: role === 'SUPER_ADMIN' ? {} : {
                    OR: [
                        { id: userTenantId || undefined },
                        { owner: email || undefined },
                        { owner: userName || undefined }
                    ].filter(cond => Object.values(cond)[0] !== undefined)
                },
                select: { id: true }
            });
            targetBranchIds = branches.map(b => b.id);
        } else if (effectiveBranchId && effectiveBranchId !== 'all') {
            targetBranchIds = [parseInt(effectiveBranchId)];
        } else if (userTenantId) {
            targetBranchIds = [userTenantId];
        }

        if (targetBranchIds.length === 0) {
            return res.status(400).json({ message: 'No valid branches found' });
        }

        const createdDevices = await Promise.all(targetBranchIds.map(tId =>
            prisma.device.create({
                data: {
                    name: targetBranchIds.length > 1 ? `${name} (${tId})` : name,
                    type,
                    ipAddress: ip,
                    status: status || 'Online',
                    tenantId: tId
                }
            })
        ));

        res.status(201).json(createdDevices.length === 1 ? createdDevices[0] : { message: 'Devices added successfully', count: createdDevices.length });
    } catch (error) {
        console.error('addDevice Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, ip, status } = req.body;
        const updatedDevice = await prisma.device.update({
            where: { id: parseInt(id) },
            data: {
                name,
                type,
                ipAddress: ip,
                status
            }
        });
        res.json(updatedDevice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.device.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Device deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getGlobalSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateGlobalSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }

        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                siteName: req.body.siteName,
                supportEmail: req.body.supportEmail,
                contactPhone: req.body.contactPhone,
                contactAddress: req.body.contactAddress,
                supportNumber: req.body.supportNumber,
                currency: req.body.currency,
                timezone: req.body.timezone
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoiceSettings = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        res.json({
            prefix: settings?.invoicePrefix,
            startNumber: settings?.invoiceStartNumber,
            gstPercent: settings?.gstPercent
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateInvoiceSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                invoicePrefix: req.body.prefix,
                invoiceStartNumber: parseInt(req.body.startNumber),
                gstPercent: parseFloat(req.body.gstPercent)
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingSettings = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        res.json({
            globalBookingEnabled: settings?.bookingEnabled,
            creditsPerBooking: settings?.creditsPerBooking,
            maxBookingsPerDay: settings?.maxBookingsPerDay,
            maxBookingsPerWeek: settings?.maxBookingsPerWeek,

            // New differentiated rules
            classCancellationWindow: settings?.classCancellationWindow,
            classAdvanceBookingDays: settings?.classAdvanceBookingDays,
            benefitCancellationWindow: settings?.benefitCancellationWindow,
            benefitAdvanceBookingDays: settings?.benefitAdvanceBookingDays,

            penaltyEnabled: settings?.penaltyEnabled,
            penaltyCredits: settings?.penaltyCredits
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateBookingSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                bookingEnabled: req.body.globalBookingEnabled,
                creditsPerBooking: parseInt(req.body.creditsPerBooking),
                maxBookingsPerDay: parseInt(req.body.maxBookingsPerDay),
                maxBookingsPerWeek: parseInt(req.body.maxBookingsPerWeek),

                // Differentiated Windows
                classCancellationWindow: parseInt(req.body.classCancellationWindow),
                classAdvanceBookingDays: parseInt(req.body.classAdvanceBookingDays),
                benefitCancellationWindow: parseInt(req.body.benefitCancellationWindow),
                benefitAdvanceBookingDays: parseInt(req.body.benefitAdvanceBookingDays),

                penaltyEnabled: req.body.penaltyEnabled,
                penaltyCredits: parseInt(req.body.penaltyCredits)
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- STAFF & MANAGEMENT ---

const getStaffMembers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {
            role: { in: ['STAFF', 'TRAINER', 'MANAGER'] }
        };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const staff = await prisma.user.findMany({ where });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addStaffMember = async (req, res) => {
    try {
        const {
            role = 'STAFF', branch,
            joiningDate, baseSalary, commission,
            ...restUserData
        } = req.body;
        let tenantId = req.user.tenantId;

        if (req.user.role === 'SUPER_ADMIN' && branch) {
            const tenantObj = await prisma.tenant.findFirst({ where: { branchName: branch } });
            if (tenantObj) {
                tenantId = tenantObj.id;
            } else {
                const altTenant = await prisma.tenant.findFirst({ where: { name: branch } });
                if (altTenant) tenantId = altTenant.id;
            }
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(restUserData.password || '123456', 10);

        const { password, ...safeUserData } = restUserData;

        const newStaff = await prisma.user.create({
            data: {
                ...safeUserData,
                password: hashedPassword,
                role,
                tenantId: tenantId || null,
                joinedDate: joiningDate ? new Date(joiningDate) : new Date(),
                baseSalary: (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') ? parseFloat(baseSalary) : null,
                config: JSON.stringify({
                    commission: (commission !== undefined && commission !== null && commission !== '') ? parseFloat(commission) : 0,
                    idType: safeUserData.idType,
                    idNumber: safeUserData.idNumber,
                    specialization: safeUserData.specialization,
                    certifications: safeUserData.certifications,
                    bio: safeUserData.bio,
                    position: safeUserData.position,
                    bankName: safeUserData.bankName,
                    taxId: safeUserData.taxId
                })
            }
        });
        res.status(201).json(newStaff);
    } catch (error) {
        console.error('Error adding staff member:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteStaffMember = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Staff member deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateStaffMember = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, email, phone, department, role,
            joiningDate, status, baseSalary, commission, accountNumber, ifsc,
            trainerConfig, salesConfig, managerConfig, documents,
            idType, idNumber, specialization, certifications, salaryType, hourlyRate, ptSharePercent, bio,
            position, bankName, taxId, tenantId
        } = req.body;

        console.log(`[updateStaffMember] Received update for ID ${id}:`, {
            position, commission, bankName, taxId, ifsc, accountNumber, role
        });

        const existingUser = await prisma.user.findUnique({ where: { id: parseInt(id) } });
        if (!existingUser) return res.status(404).json({ message: 'User not found' });

        const updateData = {};
        if (tenantId !== undefined) updateData.tenantId = parseInt(tenantId);
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (department !== undefined) updateData.department = department;
        if (status !== undefined) updateData.status = status;
        if (baseSalary !== undefined) updateData.baseSalary = baseSalary ? parseFloat(baseSalary) : null;
        if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
        if (ifsc !== undefined) updateData.ifsc = ifsc;
        if (documents !== undefined) updateData.documents = documents ? JSON.stringify(documents) : null;

        if (joiningDate) {
            updateData.joinedDate = new Date(joiningDate);
        }

        let parsedConfig = {};
        if (existingUser.config) {
            try {
                parsedConfig = typeof existingUser.config === 'string' ? JSON.parse(existingUser.config) : existingUser.config;
            } catch (e) { }
        }

        let newConfigObject = { ...parsedConfig };

        if (role) {
            let mappedRole = role.toUpperCase();
            if (role === 'Admin') mappedRole = 'BRANCH_ADMIN';
            if (role === 'Sales' || role === 'Sales Professional' || role === 'Receptionist') mappedRole = 'STAFF';
            updateData.role = mappedRole;

            if (role === 'Trainer') newConfigObject = { ...newConfigObject, ...(trainerConfig || {}) };
            else if (role === 'Sales') newConfigObject = { ...newConfigObject, ...(salesConfig || {}) };
            else if (role === 'Manager') newConfigObject = { ...newConfigObject, ...(managerConfig || {}) };
        }

        if (idType !== undefined) newConfigObject.idType = idType;
        if (idNumber !== undefined) newConfigObject.idNumber = idNumber;
        if (specialization !== undefined) newConfigObject.specialization = specialization;
        if (certifications !== undefined) newConfigObject.certifications = certifications;
        if (salaryType !== undefined) newConfigObject.salaryType = salaryType;
        if (hourlyRate !== undefined) newConfigObject.hourlyRate = hourlyRate ? parseFloat(hourlyRate) : null;
        if (ptSharePercent !== undefined) newConfigObject.ptSharePercent = ptSharePercent ? parseFloat(ptSharePercent) : null;
        if (bio !== undefined) newConfigObject.bio = bio;
        if (commission !== undefined) newConfigObject.commission = commission ? parseFloat(commission) : 0;
        if (position !== undefined) newConfigObject.position = position;
        if (bankName !== undefined) newConfigObject.bankName = bankName;
        if (taxId !== undefined) newConfigObject.taxId = taxId;

        updateData.config = JSON.stringify(newConfigObject);

        const updatedStaff = await prisma.user.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(updatedStaff);
    } catch (error) {
        console.error('Error updating staff member:', error);
        res.status(500).json({ message: error.message });
    }
};

const getWalletStats = async (req, res) => {
    try {
        const totalWallets = await prisma.wallet.count();
        const totalBalance = await prisma.wallet.aggregate({
            _sum: { balance: true }
        });
        res.json({
            totalWallets,
            totalBalance: totalBalance._sum.balance || 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberWallets = async (req, res) => {
    try {
        const { role, tenantId } = req.user;
        const whereClause = {};
        if (role !== 'SUPER_ADMIN') {
            whereClause.tenantId = tenantId;
        }

        const members = await prisma.member.findMany({
            where: whereClause,
            include: {
                tenant: {
                    select: { name: true, branchName: true }
                },
                wallet: {
                    include: {
                        transactions: {
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                }
            }
        });

        const userIds = members.map(m => m.userId).filter(id => id !== null);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true }
        });

        const userMap = users.reduce((acc, user) => {
            acc[user.id] = user.name;
            return acc;
        }, {});

        const formattedWallets = members.map(m => {
            const wallet = m.wallet || { balance: 0, transactions: [] };
            const txs = wallet.transactions || [];
            const mappedTxs = txs.map(tx => ({
                id: tx.id,
                date: tx.createdAt.toISOString().split('T')[0],
                type: tx.type,
                amount: parseFloat(tx.amount),
                description: tx.description
            }));

            return {
                id: m.memberId,
                dbId: m.id,
                name: userMap[m.userId] || `Member ${m.memberId}`,
                branch: m.tenant?.branchName || m.tenant?.name || 'Unknown',
                balance: parseFloat(wallet.balance || 0),
                transactions: mappedTxs,
                lastTransaction: txs.length > 0 ? txs[0].createdAt.toISOString().split('T')[0] : 'N/A'
            };
        });

        res.json(formattedWallets);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateMemberWallet = async (req, res) => {
    try {
        const { memberId } = req.params; // this is the MEM-123 string or ID
        const { type, amount, description } = req.body;
        const { role, tenantId } = req.user;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }

        const member = await prisma.member.findUnique({
            where: { memberId }
        });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        if (role !== 'SUPER_ADMIN' && member.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Unauthorized to modify this wallet' });
        }

        let wallet = await prisma.wallet.findUnique({
            where: { memberId: member.id }
        });

        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: {
                    memberId: member.id,
                    balance: 0
                }
            });
        }

        const numAmount = parseFloat(amount);
        let newBalance = parseFloat(wallet.balance || 0);

        if (type === 'Credit') {
            newBalance += numAmount;
        } else if (type === 'Debit') {
            // Uncomment next lines if you want strict checking against deductions below zero
            // if (newBalance < numAmount) {
            //     return res.status(400).json({ message: 'Insufficient balance' });
            // }
            newBalance -= numAmount;
        } else {
            return res.status(400).json({ message: 'Invalid transaction type' });
        }

        // Apply Tx atomically
        const [transaction, updatedWallet] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    walletId: wallet.id,
                    amount: numAmount,
                    type,
                    description: description || `${type} by ${req.user.name || 'Admin'}`
                }
            }),
            prisma.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance }
            })
        ]);

        res.json({
            transaction,
            balance: updatedWallet.balance
        });

    } catch (error) {
        console.error("Wallet Update Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const getTrainerRequests = async (req, res) => {
    try {
        const { role, tenantId } = req.user;
        const whereClause = {
            role: 'TRAINER',
        };

        if (role !== 'SUPER_ADMIN') {
            whereClause.tenantId = tenantId;
        }

        const trainers = await prisma.user.findMany({
            where: whereClause,
            include: {
                tenant: {
                    select: {
                        name: true,
                        branchName: true
                    }
                }
            }
        });

        const formattedTrainers = trainers.map(t => {
            let configObj = {};
            if (t.config) {
                try {
                    configObj = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;
                } catch (e) { }
            }
            return {
                id: t.id,
                name: t.name,
                email: t.email,
                phone: t.phone || 'N/A',
                branch: t.tenant?.branchName || t.tenant?.name || 'Unknown',
                status: t.status,
                baseSalary: t.baseSalary ? t.baseSalary.toString() : '',
                commission: t.commission ? t.commission.toString() : '',
                role: configObj.specialization || ''
            };
        });

        res.json(formattedTrainers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTrainerRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { role, tenantId } = req.user;

        const targetUser = await prisma.user.findUnique({ where: { id: parseInt(id) } });
        if (!targetUser) return res.status(404).json({ message: 'Trainer request not found' });

        if (role !== 'SUPER_ADMIN' && targetUser.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Unauthorized to update this request' });
        }

        const updated = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTrainerChangeRequests = async (req, res) => {
    res.json([]);
};

const getPayrollData = async (req, res) => {
    res.json([]);
};

const getStoreDashboardData = async (req, res) => {
    res.json({ orders: 0, revenue: 0 });
};

const getProducts = async (req, res) => {
    res.json([]);
};

const getOrders = async (req, res) => {
    res.json([]);
};

const getStoreInventory = async (req, res) => {
    res.json([]);
};

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                name,
                email,
                phone,
                address
            }
        });

        // Remove sensitive data before returning
        const { password: _, ...userWithoutPassword } = updated;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
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
};
