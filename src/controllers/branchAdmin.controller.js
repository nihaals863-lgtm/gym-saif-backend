const prisma = require('../config/prisma');

const getWhereClause = (req, prefix = '') => {
    const { tenantId, role } = req.user;
    const { branchId } = req.query;

    if (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') {
        if (branchId && branchId !== 'all' && branchId !== 'undefined' && branchId !== 'null') {
            return prefix ? { [prefix]: { tenantId: parseInt(branchId) } } : { tenantId: parseInt(branchId) };
        } else if (branchId === 'all') {
            return {};
        }
    }

    return role === 'SUPER_ADMIN' ? {} : (prefix ? { [prefix]: { tenantId } } : { tenantId });
};


// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
    try {
        const { role } = req.user;
        const whereClause = getWhereClause(req);

        // 1. Total Members
        const totalMembers = await prisma.member.count({
            where: whereClause
        });

        // 2. Active Trainers
        const activeTrainers = await prisma.user.count({
            where: {
                ...whereClause,
                role: 'TRAINER',
                status: 'Active'
            }
        });

        // 3. Today's Check-ins
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todaysCheckIns = await prisma.attendance.count({
            where: {
                ...whereClause,
                checkIn: { gte: startOfDay }
            }
        });

        // 4. Monthly Revenue (Current Month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const revenueInvoice = await prisma.invoice.aggregate({
            where: {
                ...whereClause,
                status: 'Paid',
                paidDate: { gte: startOfMonth }
            },
            _sum: { amount: true }
        });

        const revenueStore = await prisma.storeOrder.aggregate({
            where: {
                ...whereClause,
                status: { in: ['Paid', 'Completed', 'Processing'] },
                date: { gte: startOfMonth }
            },
            _sum: { total: true }
        });

        const totalMonthlyRevenue = (Number(revenueInvoice._sum.amount) || 0) + (Number(revenueStore._sum.total) || 0);

        // 5. New Leads (MTD)
        const newLeads = await prisma.lead.count({
            where: {
                ...whereClause,
                createdAt: { gte: startOfMonth }
            }
        });

        // 6. Today's Classes (Based on Bookings today)
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const todaysClassesCount = await prisma.class.count({
            where: {
                ...whereClause,
                bookings: {
                    some: {
                        date: { gte: startOfDay, lt: endOfDay }
                    }
                }
            }
        });

        // 7. Pending Approvals (Service Requests)
        const pendingApprovalsCount = await prisma.serviceRequest.count({
            where: {
                ...whereClause,
                status: 'Pending'
            }
        });

        // 8. Equipment Data
        const equipmentData = await prisma.equipment.findMany({
            where: whereClause,
            select: { id: true, name: true, status: true, category: true }
        });

        // 6. Security Risks
        const defaulterCheckIns = await prisma.attendance.count({
            where: {
                ...whereClause,
                user: {
                    status: 'Inactive'
                },
                checkIn: { gte: startOfDay }
            }
        });

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const expiringSoonCount = await prisma.member.count({
            where: {
                ...whereClause,
                status: 'Active',
                expiryDate: {
                    gte: startOfDay,
                    lte: nextWeek
                }
            }
        });

        // 7. Revenue Overview (Last 6 Months)
        const revenueOverview = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const mStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const mEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

            const mRevenueInvoice = await prisma.invoice.aggregate({
                where: {
                    ...whereClause,
                    status: 'Paid',
                    paidDate: { gte: mStart, lte: mEnd }
                },
                _count: { id: true },
                _sum: { amount: true }
            });

            const mRevenueStore = await prisma.storeOrder.aggregate({
                where: {
                    ...whereClause,
                    status: { in: ['Paid', 'Completed', 'Processing'] },
                    date: { gte: mStart, lte: mEnd }
                },
                _sum: { total: true }
            });

            revenueOverview.push({
                month: monthNames[date.getMonth()],
                value: (Number(mRevenueInvoice._sum.amount) || 0) + (Number(mRevenueStore._sum.total) || 0)
            });
        }

        // 8. Weekly Attendance (Last 7 Days)
        const weeklyAttendance = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
            const dEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

            const dCount = await prisma.attendance.count({
                where: {
                    ...whereClause,
                    checkIn: { gte: dStart, lte: dEnd }
                }
            });

            weeklyAttendance.push({
                day: dayNames[dStart.getDay()],
                count: dCount
            });
        }

        // 9. Accounts Receivable
        const receivables = await prisma.invoice.aggregate({
            where: {
                ...whereClause,
                status: { in: ['Unpaid', 'Partial'] }
            },
            _sum: { amount: true }
        });

        // 10. Membership Distribution
        const distribution = await prisma.member.groupBy({
            by: ['status'],
            where: whereClause,
            _count: { id: true }
        });

        // 11. Today's Check-ins by Hour (5am - 10pm)
        const todayCheckInsRaw = await prisma.attendance.findMany({
            where: {
                ...whereClause,
                checkIn: { gte: startOfDay }
            },
            select: { checkIn: true }
        });

        const checkInsByHour = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            label: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`,
            count: todayCheckInsRaw.filter(a => new Date(a.checkIn).getHours() === h).length
        })).filter(h => h.hour >= 5 && h.hour <= 22);

        res.json({
            stats: [
                { id: 1, title: 'Total Members', value: totalMembers, icon: 'Users', trend: 'Live', color: 'primary' },
                { id: 2, title: 'Monthly Revenue', value: `₹${totalMonthlyRevenue}`, icon: 'DollarSign', trend: 'This Month', color: 'success' },
                { id: 3, title: 'Expiring Soon', value: expiringSoonCount, icon: 'CheckCircle', trend: 'Review Needed', color: 'warning' },
                { id: 4, title: 'Today Check-ins', value: todaysCheckIns, icon: 'CheckCircle', trend: 'Today', color: 'primary' },
            ],
            newLeads,
            todaysClasses: todaysClassesCount,
            pendingApprovals: pendingApprovalsCount,
            revenueOverview,
            weeklyAttendance,
            checkInsByHour,
            receivables: receivables._sum.amount || 0,
            membershipDistribution: distribution,
            equipment: equipmentData,
            risks: {
                defaulters: defaulterCheckIns,
                expiringSoon: expiringSoonCount,
                manualOverrides: 0
            },
            liveOccupancy: {
                current: todaysCheckIns,
                capacity: 50
            }
        });

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Recent Member Activity
const getRecentActivities = async (req, res) => {
    try {
        const whereClause = getWhereClause(req, 'user');

        // Fetch recent check-ins
        const recentCheckIns = await prisma.attendance.findMany({
            where: whereClause,
            take: 5,
            orderBy: { checkIn: 'desc' },
            include: { user: { select: { name: true } } }
        });

        const activities = recentCheckIns.map((checkIn, index) => ({
            id: index + 1,
            member: checkIn.user.name,
            action: 'Check-in',
            time: new Date(checkIn.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        res.json(activities);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Trainer Availability
const getTrainerAvailability = async (req, res) => {
    try {
        const whereClause = getWhereClause(req);

        const trainers = await prisma.user.findMany({
            where: { ...whereClause, role: 'TRAINER' },
            select: { id: true, name: true, status: true }
        });

        const formattedTrainers = trainers.map(t => ({
            id: t.id,
            name: t.name,
            status: t.status === 'Active' ? 'Available' : 'Unavailable',
            specialty: 'General' // Placeholder as specialty isn't in User model yet
        }));

        res.json(formattedTrainers);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Financial Stats (Daily Collection)
const getFinancialStats = async (req, res) => {
    try {
        const whereClause = getWhereClause(req);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // 1. Fetch Invoices for Today (Paid only)
        const invoices = await prisma.invoice.findMany({
            where: {
                ...whereClause,
                status: 'Paid',
                paidDate: { gte: startOfDay }
            },
            select: {
                amount: true,
                paymentMode: true
            }
        });

        // 2. Aggregate by Payment Mode
        let cash = 0, upi = 0, card = 0;
        invoices.forEach(inv => {
            const amount = parseFloat(inv.amount);
            if (inv.paymentMode === 'Cash') cash += amount;
            else if (inv.paymentMode === 'UPI') upi += amount;
            else if (inv.paymentMode === 'Card') card += amount;
        });

        // 3. Fetch Expenses for Today
        const expenses = await prisma.expense.aggregate({
            where: {
                ...whereClause,
                date: { gte: startOfDay }
            },
            _sum: { amount: true }
        });

        const totalExpenses = parseFloat(expenses._sum.amount || 0);

        res.json({
            collection: {
                cash,
                upi,
                card
            },
            expenses: {
                today: totalExpenses
            }
        });

    } catch (error) {
        console.error('Financial Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Revenue Report
const getRevenueReport = async (req, res) => {
    try {
        const { date } = req.query;
        const whereClause = getWhereClause(req);

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Total Revenue (Paid in current month)
        const totalRevenueInvoice = await prisma.invoice.aggregate({
            where: {
                ...whereClause,
                status: 'Paid',
                paidDate: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { amount: true }
        });

        const totalRevenueStore = await prisma.storeOrder.aggregate({
            where: {
                ...whereClause,
                status: { in: ['Paid', 'Completed', 'Processing'] },
                date: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { total: true }
        });

        const totalMonthlyRevenue = (Number(totalRevenueInvoice._sum.amount) || 0) + (Number(totalRevenueStore._sum.total) || 0);

        // 2. Pending Payments
        const pendingPaymentsInvoice = await prisma.invoice.aggregate({
            where: {
                ...whereClause,
                status: { in: ['Unpaid', 'unpaid', 'Partial'] }
            },
            _sum: { amount: true }
        });

        const pendingPaymentsStore = await prisma.storeOrder.aggregate({
            where: {
                ...whereClause,
                status: { notIn: ['Paid', 'Completed', 'Processing', 'Cancelled'] }
            },
            _sum: { total: true }
        });

        const totalPendingPayments = (Number(pendingPaymentsInvoice._sum.amount) || 0) + (Number(pendingPaymentsStore._sum.total) || 0);

        // 3. Transactions (Table Data)
        const invoices = await prisma.invoice.findMany({
            where: whereClause,
            include: {
                member: { select: { name: true } },
                items: { select: { description: true }, take: 1 }
            },
            orderBy: { dueDate: 'desc' },
            take: 50
        });

        const storeOrders = await prisma.storeOrder.findMany({
            where: whereClause,
            include: {
                member: { select: { name: true } }
            },
            orderBy: { date: 'desc' },
            take: 50
        });

        const combinedTransactions = [
            ...invoices.map(inv => ({
                id: inv.id,
                date: inv.paidDate || inv.dueDate,
                member: inv.member?.name || 'Unknown',
                service: inv.items[0]?.description || 'Membership Fee',
                amount: inv.amount,
                mode: inv.paymentMode,
                status: inv.status,
                type: 'Invoice'
            })),
            ...storeOrders.map(order => ({
                id: order.id,
                date: order.date,
                member: order.member?.name || order.guestName || 'Walk-in Guest',
                service: 'Store Purchase',
                amount: order.total,
                mode: order.paymentMode || 'N/A',
                status: order.status === 'Completed' || order.status === 'Processing' ? 'Paid' : 'Unpaid',
                type: 'Store'
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);

        // Mock Target (or fetch from settings if exists)
        const monthlyTarget = 500000;

        res.json({
            stats: [
                { label: 'Total Revenue', value: (totalMonthlyRevenue).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'DollarSign', bg: 'bg-indigo-50', color: 'text-indigo-600' },
                { label: 'Monthly Target', value: (monthlyTarget).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'TrendingUp', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                { label: 'Pending Payments', value: (totalPendingPayments).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'Banknote', bg: 'bg-amber-50', color: 'text-amber-600' },
            ],
            revenueData: combinedTransactions.map(tx => ({
                id: tx.id,
                date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : 'N/A',
                member: tx.member,
                service: tx.service,
                amount: Number(tx.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                mode: tx.mode,
                status: tx.status
            }))
        });

    } catch (error) {
        console.error('Revenue Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Membership Report
const getMembershipReport = async (req, res) => {
    try {
        const { date } = req.query;
        const whereClause = getWhereClause(req);

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Active Members Total
        const activeMembersCount = await prisma.member.count({
            where: {
                ...whereClause,
                status: 'Active'
            }
        });

        // 2. New Joins (MTD)
        const newJoinsCount = await prisma.member.count({
            where: {
                ...whereClause,
                joinDate: { gte: startOfMonth, lt: endOfMonth }
            }
        });

        // 3. Expired (MTD)
        const expiredCount = await prisma.member.count({
            where: {
                ...whereClause,
                status: 'Expired',
                expiryDate: { gte: startOfMonth, lt: endOfMonth }
            }
        });

        // 4. Member List (Table Data) — all members, not just this month
        const members = await prisma.member.findMany({
            where: whereClause,
            include: { plan: { select: { name: true } } },
            orderBy: { joinDate: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Active Members', value: activeMembersCount.toLocaleString(), icon: 'UserCheck', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                { label: 'New Joins (MTD)', value: newJoinsCount.toLocaleString(), icon: 'UserPlus', bg: 'bg-blue-50', color: 'text-blue-600' },
                { label: 'Expired (MTD)', value: expiredCount.toLocaleString(), icon: 'UserMinus', bg: 'bg-rose-50', color: 'text-rose-600' },
            ],
            membershipData: members.map(m => ({
                id: m.id,
                name: m.name || 'Unknown',
                plan: m.plan?.name || 'No Plan',
                startDate: m.joinDate ? m.joinDate.toISOString().split('T')[0] : 'N/A',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : 'N/A',
                status: m.status
            }))
        });

    } catch (error) {
        console.error('Membership Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Lead Conversion Report
const getLeadConversionReport = async (req, res) => {
    try {
        const { date } = req.query;
        const whereClause = getWhereClause(req);

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // Stats: based on selected month
        const totalLeads = await prisma.lead.count({
            where: { ...whereClause, createdAt: { gte: startOfMonth, lt: endOfMonth } }
        });
        const convertedLeads = await prisma.lead.count({
            where: { ...whereClause, status: 'Converted', updatedAt: { gte: startOfMonth, lt: endOfMonth } }
        });
        const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0;

        // Table: show all leads for the tenant (most recent first)
        const leads = await prisma.lead.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Total Leads (MTD)', value: totalLeads.toLocaleString(), icon: 'MousePointer2', bg: 'bg-orange-50', color: 'text-orange-600' },
                { label: 'Converted (MTD)', value: convertedLeads.toLocaleString(), icon: 'Target', bg: 'bg-purple-50', color: 'text-purple-600' },
                { label: 'Conversion Rate', value: `${conversionRate}%`, icon: 'Percent', bg: 'bg-blue-50', color: 'text-blue-600' },
            ],
            leadData: leads.map(l => ({
                id: l.id,
                name: l.name || 'Anonymous',
                source: l.source || 'Direct',
                date: l.createdAt.toISOString().split('T')[0],
                status: l.status,
                notes: l.notes || 'No notes available'
            }))
        });

    } catch (error) {
        console.error('Lead Conversion Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Expense Report
const getExpenseReport = async (req, res) => {
    try {
        const { date } = req.query;
        const whereClause = getWhereClause(req);

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Total Expenses
        const totalExpenses = await prisma.expense.aggregate({
            where: {
                ...whereClause,
                date: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { amount: true }
        });

        // 2. Operational Costs (Everything except Inventory category)
        const operationalCosts = await prisma.expense.aggregate({
            where: {
                ...whereClause,
                date: { gte: startOfMonth, lt: endOfMonth },
                category: { not: 'Inventory' }
            },
            _sum: { amount: true }
        });

        // 3. Supplies/Inventory
        const inventoryCosts = await prisma.expense.aggregate({
            where: {
                ...whereClause,
                date: { gte: startOfMonth, lt: endOfMonth },
                category: 'Inventory'
            },
            _sum: { amount: true }
        });

        // 4. Expense List — all tenant expenses
        const expenses = await prisma.expense.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Total Expenses', value: (totalExpenses._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'CreditCard', bg: 'bg-rose-50', color: 'text-rose-600' },
                { label: 'Operational Costs', value: (operationalCosts._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'Zap', bg: 'bg-blue-50', color: 'text-blue-600' },
                { label: 'Supplies/Inventory', value: (inventoryCosts._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'ShoppingBag', bg: 'bg-amber-50', color: 'text-amber-600' },
            ],
            expenseData: expenses.map(e => ({
                id: e.id,
                date: e.date.toISOString().split('T')[0],
                category: e.category,
                description: e.title,
                amount: (e.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                status: e.status
            }))
        });

    } catch (error) {
        console.error('Expense Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getPerformanceReport = async (req, res) => {
    try {
        const whereClause = getWhereClause(req);
        const today = new Date();
        const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // 1. Basic Stats
        const totalMembers = await prisma.member.count({ where: { ...whereClause, status: { in: ['Active', 'active'] } } });

        const revenueInvoiceStr = await prisma.invoice.aggregate({
            where: { ...whereClause, status: { in: ['Paid', 'paid'] }, paidDate: { gte: startOfThisMonth } },
            _sum: { amount: true }
        });
        const revenueStoreStr = await prisma.storeOrder.aggregate({
            where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: startOfThisMonth } },
            _sum: { total: true }
        });
        const revenueThisMonth = Number(revenueInvoiceStr._sum.amount || 0) + Number(revenueStoreStr._sum.total || 0);

        const pendingDuesInvoiceStr = await prisma.invoice.aggregate({
            where: { ...whereClause, status: { in: ['Unpaid', 'unpaid', 'Partial', 'Overdue'] } },
            _sum: { amount: true }
        });
        const pendingDuesStoreStr = await prisma.storeOrder.aggregate({
            where: { ...whereClause, status: { notIn: ['Paid', 'Completed', 'Processing', 'Cancelled'] } },
            _sum: { total: true }
        });
        const pendingDues = Number(pendingDuesInvoiceStr._sum.amount || 0) + Number(pendingDuesStoreStr._sum.total || 0);

        const totalInvoicedStr = await prisma.invoice.aggregate({
            where: { ...whereClause, paidDate: { gte: startOfThisMonth } },
            _sum: { amount: true }
        });
        const totalStoreOrdersStr = await prisma.storeOrder.aggregate({
            where: { ...whereClause, date: { gte: startOfThisMonth } },
            _sum: { total: true }
        });
        const totalInvoiced = Number(totalInvoicedStr._sum.amount || 0) + Number(totalStoreOrdersStr._sum.total || 0);

        const collectionRate = totalInvoiced > 0 ? ((revenueThisMonth / totalInvoiced) * 100).toFixed(1) : 0;

        // 2. Earnings Report (Last 12 months)
        const earningsValues = [];
        const earningsMonths = [];
        const profitValues = [];
        const expenseValues = [];
        let totalIncome = 0;
        let totalExpenses = 0;

        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const startStr = new Date(date.getFullYear(), date.getMonth(), 1);
            const endStr = new Date(date.getFullYear(), date.getMonth() + 1, 1);

            const monthRevInvoice = await prisma.invoice.aggregate({
                where: { ...whereClause, status: { in: ['Paid', 'paid'] }, paidDate: { gte: startStr, lt: endStr } },
                _sum: { amount: true }
            });
            const monthRevStore = await prisma.storeOrder.aggregate({
                where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: startStr, lt: endStr } },
                _sum: { total: true }
            });
            const monthExp = await prisma.expense.aggregate({
                where: { ...whereClause, date: { gte: startStr, lt: endStr } },
                _sum: { amount: true }
            }).catch(() => ({ _sum: { amount: 0 } }));

            const r = Number(monthRevInvoice._sum.amount || 0) + Number(monthRevStore._sum.total || 0);
            const e = Number(monthExp._sum.amount || 0);

            earningsMonths.push(date.toLocaleString('default', { month: 'short' }).toUpperCase());
            earningsValues.push((r / 1000).toFixed(1));
            profitValues.push(((r - e) / 1000).toFixed(1));
            expenseValues.push((e / 1000).toFixed(1));

            totalIncome += r;
            totalExpenses += e;
        }

        // 3. Weekly Earnings (Last 7 days)
        const weeklyValues = [];
        const weeklyDays = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);

            const nextD = new Date(d);
            nextD.setDate(d.getDate() + 1);

            const dRevInvoice = await prisma.invoice.aggregate({
                where: { ...whereClause, status: { in: ['Paid', 'paid'] }, paidDate: { gte: d, lt: nextD } },
                _sum: { amount: true }
            });
            const dRevStore = await prisma.storeOrder.aggregate({
                where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: d, lt: nextD } },
                _sum: { total: true }
            });
            weeklyDays.push(d.toLocaleString('default', { weekday: 'short' }).toUpperCase());
            weeklyValues.push(((Number(dRevInvoice._sum.amount || 0) + Number(dRevStore._sum.total || 0)) / 1000).toFixed(1));
        }

        // 4. Member Retention (Distribution)
        const retention = await prisma.member.groupBy({
            by: ['status'],
            where: whereClause,
            _count: { id: true }
        });

        // 5. Membership Growth (New members per month, last 12 months)
        const growthMonths = [];
        const growthLabels = [];
        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const startStr = new Date(date.getFullYear(), date.getMonth(), 1);
            const endStr = new Date(date.getFullYear(), date.getMonth() + 1, 1);

            const count = await prisma.member.count({
                where: { ...whereClause, joinDate: { gte: startStr, lt: endStr } }
            });

            growthLabels.push(date.toLocaleString('default', { month: 'short' }));
            growthMonths.push(count);
        }

        const revByPlan = await prisma.invoice.groupBy({
            by: ['notes'], // Note: Assuming notes or a relation links back to plans in current schema. 
            where: { ...whereClause, status: { in: ['Paid', 'paid'] } },
            _sum: { amount: true }
        });
        // Trying to get plan names based on Member relation if available
        const planRevenueRaw = await prisma.member.findMany({
            where: whereClause,
            select: {
                plan: { select: { name: true } },
                invoices: {
                    where: { status: { in: ['Paid', 'paid'] } },
                    select: { amount: true }
                }
            }
        });

        const planMap = {};
        planRevenueRaw.forEach(m => {
            const pName = m.plan?.name || 'No Plan';
            const total = m.invoices.reduce((acc, inv) => acc + Number(inv.amount), 0);
            planMap[pName] = (planMap[pName] || 0) + total;
        });

        const revenueByPlan = Object.entries(planMap).map(([name, value]) => ({ name, value }));

        // 7. Popular Products
        const popularProducts = await prisma.storeOrderItem.groupBy({
            by: ['productId'],
            where: { order: { ...whereClause } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5
        });

        // Enrich popular products with names
        const enrichedProducts = await Promise.all(popularProducts.map(async (p) => {
            const prod = await prisma.storeProduct.findUnique({ where: { id: p.productId }, select: { name: true } });
            return { name: prod?.name || 'Unknown', quantity: p._sum.quantity };
        }));

        // 8. Recent Store Orders
        const recentOrders = await prisma.storeOrder.findMany({
            where: whereClause,
            take: 10,
            orderBy: { date: 'desc' },
            select: { id: true, total: true, status: true, date: true, itemsCount: true }
        });

        res.json({
            stats: {
                totalMembers,
                revenueThisMonth,
                collectionRate,
                pendingDues
            },
            earnings: {
                months: earningsMonths,
                revenue: earningsValues,
                profit: profitValues,
                expenses: expenseValues,
                totalIncome,
                totalExpenses
            },
            weekly: {
                days: weeklyDays,
                values: weeklyValues
            },
            retention: retention.map(r => ({ status: r.status, count: r._count.id })),
            growth: {
                labels: growthLabels,
                values: growthMonths
            },
            revenueByPlan,
            popularProducts: enrichedProducts,
            recentOrders: recentOrders.map(o => ({
                ...o,
                date: o.date.toISOString().split('T')[0]
            }))
        });

    } catch (error) {
        console.error('Performance Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Full Attendance Report
const getAttendanceReport = async (req, res) => {
    try {
        const { date, type, search, page = 1, limit = 10 } = req.query;
        const whereClause = getWhereClause(req);

        let startOfDay;
        if (date) {
            startOfDay = new Date(date + 'T00:00:00.000Z');
        } else {
            const d = new Date();
            startOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        }
        const endOfDay = new Date(startOfDay);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

        const where = {
            ...whereClause,
            date: { gte: startOfDay, lt: endOfDay }
        };

        if (type && type !== 'All') {
            where.user = where.user || {};
            where.user.role = type.toUpperCase();
        }

        if (search) {
            where.user = where.user || {};
            where.user.name = { contains: search };
        }

        const [attendance, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                include: { user: true },
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.attendance.count({ where })
        ]);

        // Stats
        const totalToday = await prisma.attendance.count({ where: { ...whereClause, date: { gte: startOfDay, lt: endOfDay } } });
        const membersToday = await prisma.attendance.count({ where: { ...whereClause, user: { role: 'MEMBER' }, date: { gte: startOfDay, lt: endOfDay } } });
        const staffToday = await prisma.attendance.count({ where: { ...whereClause, user: { role: { in: ['STAFF', 'TRAINER', 'MANAGER'] } }, date: { gte: startOfDay, lt: endOfDay } } });

        res.json({
            data: attendance.map(a => ({
                id: a.id,
                name: a.user?.name || 'Unknown',
                type: a.user?.role === 'MEMBER' ? 'Member' : (a.user?.role === 'TRAINER' ? 'Trainer' : 'Staff'),
                checkIn: a.checkIn ? a.checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: a.checkOut ? a.checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: a.checkOut ? 'checked-out' : (a.checkIn ? 'checked-in' : 'absent')
            })),
            total,
            stats: { totalToday, membersToday, staffToday }
        });
    } catch (error) {
        console.error('Attendance Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Full Booking Report
const getBookingReport = async (req, res) => {
    try {
        const { search, status, dateRange, page = 1, limit = 10 } = req.query;
        const whereClause = getWhereClause(req, 'member');

        // Build AND conditions
        const andConditions = [
            whereClause
        ];

        if (status && status !== 'All') {
            andConditions.push({ status });
        }

        if (search) {
            andConditions.push({
                OR: [
                    { member: { name: { contains: search } } },
                    { class: { name: { contains: search } } }
                ]
            });
        }

        // Date Range logic
        if (dateRange && dateRange !== 'All') {
            const now = new Date();
            if (dateRange === 'Today') {
                const sod = new Date(now); sod.setHours(0, 0, 0, 0);
                const eod = new Date(now); eod.setHours(23, 59, 59, 999);
                andConditions.push({ date: { gte: sod, lte: eod } });
            } else if (dateRange === 'This Week') {
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                andConditions.push({ date: { gte: weekAgo } });
            } else if (dateRange === 'This Month') {
                const som = new Date(now); som.setDate(1); som.setHours(0, 0, 0, 0);
                andConditions.push({ date: { gte: som } });
            }
        }

        const where = { AND: andConditions };

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                include: { member: true, class: { include: { trainer: true } } },
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.booking.count({ where })
        ]);

        const stats = {
            total: await prisma.booking.count({ where: whereClause }),
            completed: await prisma.booking.count({ where: { AND: [whereClause, { status: 'Completed' }] } }),
            cancelled: await prisma.booking.count({ where: { AND: [whereClause, { status: 'Cancelled' }] } })
        };

        res.json({
            data: bookings.map(b => ({
                id: b.id,
                memberName: b.member?.name || 'Unknown',
                classType: b.class?.name || 'Private Session',
                trainerName: b.class?.trainer?.name || 'Any Trainer',
                time: b.date ? b.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                date: b.date ? b.date.toISOString().split('T')[0] : '-',
                status: b.status || 'Pending'
            })),
            total,
            stats
        });
    } catch (error) {
        console.error('Booking Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Live Access Control — today's check-ins with membership/dues status
const getLiveAccess = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

        // Fetch today's attendance records for this tenant
        const records = await prisma.attendance.findMany({
            where: { ...whereClause, date: { gte: startOfDay, lte: endOfDay } },
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { checkIn: 'desc' },
            take: 50
        });

        const checkins = await Promise.all(records.map(async (r) => {
            // Try to find member record to get expiry + dues
            const member = await prisma.member.findFirst({
                where: { userId: r.userId, ...whereClause },
                include: { plan: { select: { name: true } } }
            });

            // Get outstanding dues (unpaid invoices)
            const dues = await prisma.invoice.aggregate({
                where: { memberId: member?.id, status: { in: ['Unpaid', 'Partial'] } },
                _sum: { amount: true }
            });

            return {
                id: r.id,
                member: r.user?.name || 'Unknown',
                plan: member?.plan?.name || r.user?.role || 'Staff',
                time: r.checkIn ? r.checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                expiry: member?.expiryDate ? member.expiryDate.toISOString().split('T')[0] : null,
                balance: parseFloat(dues._sum.amount || 0),
                photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user?.name || 'U')}&background=6d28d9&color=fff&size=48`
            };
        }));

        res.json(checkins);
    } catch (error) {
        console.error('Live Access Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Renewal Alerts — expiring soon + recently expired members
const getRenewalAlerts = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);

        const minus15Days = new Date(today);
        minus15Days.setDate(today.getDate() - 15);

        // Expiring within 7 days (not yet expired)
        const expiringSoon = await prisma.member.findMany({
            where: {
                ...whereClause,
                status: 'Active',
                expiryDate: { gte: today, lte: in7Days }
            },
            include: { plan: { select: { name: true } } },
            orderBy: { expiryDate: 'asc' },
            take: 5
        });

        // Expired in last 15 days
        const recentlyExpired = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: minus15Days, lt: today }
            },
            include: { plan: { select: { name: true } } },
            orderBy: { expiryDate: 'desc' },
            take: 5
        });

        res.json({
            expiringSoon: expiringSoon.map(m => ({
                id: m.id,
                memberName: m.name,
                planName: m.plan?.name || 'No Plan',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : null,
                phone: m.phone || null
            })),
            recentlyExpired: recentlyExpired.map(m => ({
                id: m.id,
                memberName: m.name,
                planName: m.plan?.name || 'No Plan',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : null,
                phone: m.phone || null
            }))
        });
    } catch (error) {
        console.error('Renewal Alerts Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
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
};
