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
        
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [totalMembers, activeTrainers, todaysCheckIns, revenueInvoice, revenueStore, newLeads, todaysClassesCount, pendingApprovalsCount, equipmentData, defaulterCheckIns, expiringSoonCount, taskCounts, overdueTasks] = await Promise.all([
            // 1. Total Members
            prisma.member.count({ where: whereClause }),
            // 2. Active Trainers
            prisma.user.count({ where: { ...whereClause, role: 'TRAINER', status: 'Active' } }),
            // 3. Today's Check-ins (Manual + Hardware)
            prisma.attendance.count({ where: { ...whereClause, checkIn: { gte: startOfDay } } }).then(async (manual) => {
                const activeBranchId = (whereClause.tenantId || req.user.tenantId);
                const hardware = await prisma.accessLog.count({
                    where: {
                        OR: [
                            { branchId: parseInt(activeBranchId) },
                            { personTenantId: parseInt(activeBranchId) }
                        ],
                        scanTime: { gte: startOfDay, lt: endOfDay }
                    }
                });
                return manual + hardware;
            }),
            // 4. Monthly Revenue (Invoices)
            prisma.invoice.aggregate({ where: { ...whereClause, status: 'Paid', paidDate: { gte: startOfMonth } }, _sum: { amount: true } }),
            // 4. Monthly Revenue (Store)
            prisma.storeOrder.aggregate({ where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: startOfMonth } }, _sum: { total: true } }),
            // 5. New Leads (MTD)
            prisma.lead.count({ where: { ...whereClause, createdAt: { gte: startOfMonth } } }),
            // 6. Today's Classes
            prisma.class.count({ where: { ...whereClause, bookings: { some: { date: { gte: startOfDay, lt: endOfDay } } } } }),
            // 7. Pending Approvals
            prisma.serviceRequest.count({ where: { ...whereClause, status: 'Pending' } }),
            // 8. Equipment Data
            prisma.equipment.findMany({ where: whereClause, select: { id: true, name: true, status: true, category: true } }),
            // 9. Security Risks
            prisma.attendance.count({ where: { ...whereClause, user: { status: 'Inactive' }, checkIn: { gte: startOfDay } } }),
            // 10. Expiring Soon
            prisma.member.count({ where: { ...whereClause, status: 'Active', expiryDate: { gte: startOfDay, lte: nextWeek } } }),
            // 11. Task Counts
            prisma.task.groupBy({
                by: ['status'],
                where: whereClause,
                _count: { id: true }
            }),
            // 12. Overdue Tasks
            prisma.task.count({
                where: {
                    ...whereClause,
                    status: { notIn: ['Completed', 'Approved'] },
                    dueDate: { lt: now }
                }
            })
        ]);

        const taskStats = {
            total: taskCounts.reduce((acc, curr) => acc + curr._count.id, 0),
            pending: taskCounts.find(t => t.status === 'Pending')?._count.id || 0,
            inProgress: taskCounts.find(t => t.status === 'In Progress')?._count.id || 0,
            completed: taskCounts.find(t => t.status === 'Completed')?._count.id || 0,
            approved: taskCounts.find(t => t.status === 'Approved')?._count.id || 0,
            overdue: overdueTasks
        };

        const totalMonthlyRevenue = (Number(revenueInvoice._sum.amount) || 0) + (Number(revenueStore._sum.total) || 0);

        // 7. Revenue Overview (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const [monthRevInvoiceArr, monthRevStoreArr, weeklyAttendanceArr] = await Promise.all([
            prisma.invoice.findMany({
                where: {
                    ...whereClause,
                    status: 'Paid',
                    paidDate: { gte: sixMonthsAgo }
                },
                select: { amount: true, paidDate: true }
            }),
            prisma.storeOrder.findMany({
                where: {
                    ...whereClause,
                    status: { in: ['Paid', 'Completed', 'Processing'] },
                    date: { gte: sixMonthsAgo }
                },
                select: { total: true, date: true }
            }),
            prisma.attendance.findMany({
                where: {
                    ...whereClause,
                    checkIn: { gte: new Date(new Date().setDate(new Date().getDate() - 6)) }
                },
                select: { checkIn: true }
            })
        ]);

        const revenueOverview = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const m = date.getMonth();
            const y = date.getFullYear();

            const invoiceSum = monthRevInvoiceArr
                .filter(inv => {
                    const d = new Date(inv.paidDate);
                    return d.getMonth() === m && d.getFullYear() === y;
                })
                .reduce((sum, inv) => sum + Number(inv.amount), 0);

            const storeSum = monthRevStoreArr
                .filter(order => {
                    const d = new Date(order.date);
                    return d.getMonth() === m && d.getFullYear() === y;
                })
                .reduce((sum, order) => sum + Number(order.total), 0);

            revenueOverview.push({
                month: monthNames[m],
                value: invoiceSum + storeSum
            });
        }

        // 8. Weekly Attendance (Last 7 Days)
        const weeklyAttendance = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toDateString();

            const dCount = weeklyAttendanceArr.filter(a => new Date(a.checkIn).toDateString() === dateStr).length;

            weeklyAttendance.push({
                day: dayNames[date.getDay()],
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

        // Fetch Recent Feedback (Member Voice) — safe query with manual member enrichment
        let recentFeedback = [];
        try {
            const feedbackTenantId = whereClause.tenantId;
            const feedbackQuery = {};
            if (feedbackTenantId) {
                feedbackQuery.tenantId = feedbackTenantId;
            }

            const rawFeedbacks = await prisma.feedback.findMany({
                where: feedbackQuery,
                take: 3,
                orderBy: { date: 'desc' }
            });

            // Enrich with member names
            for (const f of rawFeedbacks) {
                let memberName = 'Anonymous';
                let memberAvatar = null;
                if (f.memberId) {
                    const member = await prisma.member.findUnique({
                        where: { id: f.memberId },
                        select: { name: true, avatar: true }
                    }).catch(() => null);
                    if (member) {
                        memberName = member.name || 'Anonymous';
                        memberAvatar = member.avatar;
                    }
                }
                recentFeedback.push({
                    id: f.id,
                    memberName,
                    rating: f.rating,
                    comment: f.comment,
                    date: f.date,
                    avatar: memberAvatar
                });
            }
        } catch (fbErr) {
            console.warn('Feedback fetch skipped:', fbErr.message);
        }

        // Calculate Net Profit for Store (Sale Price - Cost Price)
        const storeOrderItemsMTD = await prisma.storeOrderItem.findMany({
            where: {
                order: {
                    ...whereClause,
                    status: { in: ['Paid', 'Completed', 'Processing'] },
                    date: { gte: startOfMonth }
                }
            },
            include: {
                product: {
                    select: { costPrice: true }
                }
            }
        });

        const storeNetProfit = storeOrderItemsMTD.reduce((sum, item) => {
            const salePrice = Number(item.priceAtBuy) || 0;
            const costPrice = Number(item.product?.costPrice) || 0;
            return sum + (item.quantity * (salePrice - costPrice));
        }, 0);

        res.json({
            stats: [
                { id: 1, title: 'Total Members', value: totalMembers, icon: 'Users', trend: 'Live', color: 'primary' },
                { id: 2, title: 'Monthly Revenue', value: `₹${totalMonthlyRevenue}`, icon: 'DollarSign', trend: 'This Month', color: 'success' },
                { id: 3, title: 'Store Sales', value: `₹${Number(revenueStore._sum.total || 0).toFixed(0)}`, icon: 'ShoppingBag', trend: 'Monthly', color: 'warning' },
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
                capacity: 50 // In a real scenario, this could be fetched from Tenant settings
            },
            netProfit: storeNetProfit,
            storeSales: Number(revenueStore._sum.total || 0),
            recentFeedback,
            taskStats
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

        // Fetch manual check-ins
        const recentCheckIns = await prisma.attendance.findMany({
            where: whereClause,
            take: 5,
            orderBy: { checkIn: 'desc' },
            include: { user: { select: { name: true } } }
        });

        // Fetch hardware logs
        const activeBranchId = (whereClause.user?.tenantId || req.user.tenantId);
        const recentHardwareLogs = await prisma.accessLog.findMany({
            where: {
                OR: [
                    { branchId: parseInt(activeBranchId) },
                    { personTenantId: parseInt(activeBranchId) }
                ]
            },
            take: 5,
            orderBy: { scanTime: 'desc' }
        });

        // Merge and sort
        const manualActivities = recentCheckIns.map(checkIn => ({
            id: `at-${checkIn.id}`,
            member: checkIn.user.name,
            action: 'Manual Check-in',
            time: new Date(checkIn.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date(checkIn.checkIn).getTime()
        }));

        const hardwareActivities = recentHardwareLogs.map(log => ({
            id: `hw-${log.id}`,
            member: log.personName || 'Stranger',
            action: `Face Scan (${log.deviceName || 'AIoT'})`,
            time: new Date(log.scanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date(log.scanTime).getTime()
        }));

        const activities = [...manualActivities, ...hardwareActivities]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);

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

        const [invoices, expensesSum] = await Promise.all([
            prisma.invoice.findMany({
                where: { ...whereClause, status: 'Paid', paidDate: { gte: startOfDay } },
                select: { amount: true, paymentMode: true }
            }),
            prisma.expense.aggregate({
                where: { ...whereClause, date: { gte: startOfDay } },
                _sum: { amount: true }
            })
        ]);

        // 2. Aggregate by Payment Mode
        let cash = 0, upi = 0, card = 0;
        invoices.forEach(inv => {
            const amount = parseFloat(inv.amount);
            if (inv.paymentMode === 'Cash') cash += amount;
            else if (inv.paymentMode === 'UPI') upi += amount;
            else if (inv.paymentMode === 'Card') card += amount;
        });

        const totalExpenses = parseFloat(expensesSum._sum.amount || 0);

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

        const [totalRevenueInvoice, totalRevenueStore, pendingPaymentsInvoice, pendingPaymentsStore] = await Promise.all([
            prisma.invoice.aggregate({
                where: { ...whereClause, status: 'Paid', paidDate: { gte: startOfMonth, lt: endOfMonth } },
                _sum: { amount: true }
            }),
            prisma.storeOrder.aggregate({
                where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: startOfMonth, lt: endOfMonth } },
                _sum: { total: true }
            }),
            prisma.invoice.aggregate({
                where: { ...whereClause, status: { in: ['Unpaid', 'unpaid', 'Partial'] } },
                _sum: { amount: true }
            }),
            prisma.storeOrder.aggregate({
                where: { ...whereClause, status: { notIn: ['Paid', 'Completed', 'Processing', 'Cancelled'] } },
                _sum: { total: true }
            })
        ]);

        const totalMonthlyRevenue = (Number(totalRevenueInvoice._sum.amount) || 0) + (Number(totalRevenueStore._sum.total) || 0);
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

        const [activeMembersCount, newJoinsCount, expiredCount] = await Promise.all([
            prisma.member.count({ where: { ...whereClause, status: 'Active' } }),
            prisma.member.count({ where: { ...whereClause, joinDate: { gte: startOfMonth, lt: endOfMonth } } }),
            prisma.member.count({ where: { ...whereClause, status: 'Expired', expiryDate: { gte: startOfMonth, lt: endOfMonth } } })
        ]);

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

        const [totalLeads, convertedLeads] = await Promise.all([
            prisma.lead.count({ where: { ...whereClause, createdAt: { gte: startOfMonth, lt: endOfMonth } } }),
            prisma.lead.count({ where: { ...whereClause, status: 'Converted', updatedAt: { gte: startOfMonth, lt: endOfMonth } } })
        ]);
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

        const [totalExpenses, operationalCosts, inventoryCosts] = await Promise.all([
            prisma.expense.aggregate({ where: { ...whereClause, date: { gte: startOfMonth, lt: endOfMonth } }, _sum: { amount: true } }),
            prisma.expense.aggregate({ where: { ...whereClause, date: { gte: startOfMonth, lt: endOfMonth }, category: { not: 'Inventory' } }, _sum: { amount: true } }),
            prisma.expense.aggregate({ where: { ...whereClause, date: { gte: startOfMonth, lt: endOfMonth }, category: 'Inventory' }, _sum: { amount: true } })
        ]);

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

        const [
            totalMembers,
            revenueMtdInvoice,
            revenueMtdStore,
            pendingDuesInvoice,
            pendingDuesStore,
            totalInvoicedInMonth,
            totalStoreInvoicedInMonth,
            bulkInvoices,
            bulkOrders,
            bulkExpenses,
            bulkAttendance,
            growthStats
        ] = await Promise.all([
            prisma.member.count({ where: { ...whereClause, status: { in: ['Active', 'active'] } } }),
            prisma.invoice.aggregate({ where: { ...whereClause, status: { in: ['Paid', 'paid'] }, paidDate: { gte: startOfThisMonth } }, _sum: { amount: true } }),
            prisma.storeOrder.aggregate({ where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: startOfThisMonth } }, _sum: { total: true } }),
            prisma.invoice.aggregate({ where: { ...whereClause, status: { in: ['Unpaid', 'unpaid', 'Partial', 'Overdue'] } }, _sum: { amount: true } }),
            prisma.storeOrder.aggregate({ where: { ...whereClause, status: { notIn: ['Paid', 'Completed', 'Processing', 'Cancelled'] } }, _sum: { total: true } }),
            prisma.invoice.aggregate({ where: { ...whereClause, paidDate: { gte: startOfThisMonth } }, _sum: { amount: true } }),
            prisma.storeOrder.aggregate({ where: { ...whereClause, date: { gte: startOfThisMonth } }, _sum: { total: true } }),
            // Last 12 months bulk
            prisma.invoice.findMany({
                where: { ...whereClause, status: { in: ['Paid', 'paid'] }, paidDate: { gte: new Date(new Date().setFullYear(today.getFullYear() - 1)) } },
                select: { amount: true, paidDate: true }
            }),
            prisma.storeOrder.findMany({
                where: { ...whereClause, status: { in: ['Paid', 'Completed', 'Processing'] }, date: { gte: new Date(new Date().setFullYear(today.getFullYear() - 1)) } },
                include: { items: { include: { product: { select: { costPrice: true } } } } }
            }),
            prisma.expense.findMany({
                where: { ...whereClause, date: { gte: new Date(new Date().setFullYear(today.getFullYear() - 1)) } },
                select: { amount: true, date: true }
            }).catch(() => []),
            prisma.attendance.findMany({
                where: { ...whereClause, checkIn: { gte: new Date(new Date().setDate(today.getDate() - 6)) } },
                select: { checkIn: true }
            }),
            prisma.member.findMany({
                where: { ...whereClause, joinDate: { gte: new Date(new Date().setFullYear(today.getFullYear() - 1)) } },
                select: { joinDate: true }
            })
        ]);

        const totalRevenueStoreInvoices = bulkOrders.reduce((sum, o) => sum + Number(o.total), 0);
        const revenueThisMonth = Number(revenueMtdInvoice._sum.amount || 0) + Number(revenueMtdStore._sum.total || 0);
        const pendingDues = Number(pendingDuesInvoice._sum.amount || 0) + Number(pendingDuesStore._sum.total || 0);
        const totalInvoiced = Number(totalInvoicedInMonth._sum.amount || 0) + Number(totalStoreInvoicedInMonth._sum.total || 0);

        const collectionRate = totalInvoiced > 0 ? ((revenueThisMonth / totalInvoiced) * 100).toFixed(1) : 0;

        // Process data in memory
        const earningsValues = [];
        const earningsMonths = [];
        const profitValues = [];
        const expenseValues = [];
        const growthMonths = [];
        const growthLabels = [];
        let totalIncome = 0;
        let totalExpenses = 0;
        let totalNetProfitCalculated = 0;

        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const m = date.getMonth();
            const y = date.getFullYear();

            const membershipR = bulkInvoices
                .filter(inv => { const d = new Date(inv.paidDate); return d.getMonth() === m && d.getFullYear() === y; })
                .reduce((s, i) => s + Number(i.amount), 0);
            
            const ordersInMonth = bulkOrders
                .filter(o => { const d = new Date(o.date); return d.getMonth() === m && d.getFullYear() === y; });

            const storeR = ordersInMonth.reduce((s, o) => s + Number(o.total), 0);
            const r = membershipR + storeR;

            // Calculate Store Net Profit (Sale - Cost) for the month
            const storeMonthProfit = ordersInMonth.reduce((acc, order) => {
                const orderProfit = order.items.reduce((sum, item) => {
                    const sale = Number(item.priceAtBuy) || 0;
                    const cost = Number(item.product?.costPrice) || 0;
                    return sum + (item.quantity * (sale - cost));
                }, 0);
                return acc + orderProfit;
            }, 0);

            const e = bulkExpenses
                .filter(ex => { const d = new Date(ex.date); return d.getMonth() === m && d.getFullYear() === y; })
                .reduce((s, ex) => s + Number(ex.amount), 0);

            // Fetch Staff Salaries and Commissions for this month
            // Note: This is an estimation for reports, ideally linked to a Payroll model
            const staffInMonth = await prisma.user.findMany({
                where: { ...whereClause, status: 'Active', role: { in: ['TRAINER', 'MANAGER', 'STAFF'] } },
                select: { id: true, baseSalary: true, config: true, role: true }
            });

            let monthlyStaffCost = 0;
            let monthlyCommissionsCost = 0;

            for (const s of staffInMonth) {
                monthlyStaffCost += parseFloat(s.baseSalary || 0);
                
                if (s.role === 'TRAINER') {
                    let parsedConfig = {};
                    try {
                        if (s.config) parsedConfig = typeof s.config === 'string' ? JSON.parse(s.config) : s.config;
                    } catch (e) { }

                    const hRate = parsedConfig.hourlyRate || 500;
                    const commFix = parsedConfig.commission || 0;

                    // Sessions in this specific month
                    const sessionsInMonth = await prisma.pTSession.count({
                        where: { trainerId: s.id, status: 'Completed', date: { gte: date, lt: new Date(y, m + 1, 1) } }
                    });
                    
                    // Fixed commission for general clients
                    const assignedMembers = await prisma.member.count({
                        where: { trainerId: s.id, status: 'Active' }
                    });

                    monthlyCommissionsCost += (sessionsInMonth * hRate) + (assignedMembers * commFix);
                }
            }

            const totalMonthlyExpense = e + monthlyStaffCost + monthlyCommissionsCost;

            totalIncome += r;
            totalExpenses += totalMonthlyExpense;
            totalNetProfitCalculated += (r - totalMonthlyExpense);

            const g = growthStats
                .filter(mem => { const d = new Date(mem.joinDate); return d.getMonth() === m && d.getFullYear() === y; }).length;

            earningsMonths.push(date.toLocaleString('default', { month: 'short' }).toUpperCase());
            earningsValues.push((r / 1000).toFixed(1));
            profitValues.push((storeMonthProfit / 1000).toFixed(1)); // Using Store Net Profit as profit per request
            expenseValues.push((e / 1000).toFixed(1));
            growthLabels.push(date.toLocaleString('default', { month: 'short' }));
            growthMonths.push(g);
        }

        const weeklyValues = [];
        const weeklyDays = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dStr = d.toDateString();

            const r = bulkInvoices
                .filter(inv => new Date(inv.paidDate).toDateString() === dStr)
                .reduce((s, i) => s + Number(i.amount), 0) +
                bulkOrders
                .filter(o => new Date(o.date).toDateString() === dStr)
                .reduce((s, o) => s + Number(o.total), 0);

            weeklyDays.push(d.toLocaleString('default', { weekday: 'short' }).toUpperCase());
            weeklyValues.push((r / 1000).toFixed(1));
        }

        // 4. Member Retention (Distribution)
        const retention = await prisma.member.groupBy({
            by: ['status'],
            where: whereClause,
            _count: { id: true }
        });

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
            })),
            totalNetProfit: totalNetProfitCalculated
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
        const whereClause = getWhereClause(req);
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

        // Fetch manual records
        const manualRecords = await prisma.attendance.findMany({
            where: { ...whereClause, checkIn: { gte: startOfDay, lte: endOfDay } },
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { checkIn: 'desc' },
            take: 25
        });

        // Fetch hardware logs
        const activeBranchId = (whereClause.tenantId || req.user.tenantId);
        const hardwareLogs = await prisma.accessLog.findMany({
            where: {
                OR: [
                    { branchId: parseInt(activeBranchId) },
                    { personTenantId: parseInt(activeBranchId) }
                ],
                scanTime: { gte: startOfDay, lte: endOfDay }
            },
            orderBy: { scanTime: 'desc' },
            take: 25
        });

        // Enrich manual records
        const manualEnriched = await Promise.all(manualRecords.map(async (r) => {
            const member = await prisma.member.findFirst({
                where: { userId: r.userId, tenantId: r.tenantId },
                include: { plan: { select: { name: true } } }
            });

            const dues = await prisma.invoice.aggregate({
                where: { memberId: member?.id, status: { in: ['Unpaid', 'Partial'] } },
                _sum: { amount: true }
            });

            return {
                id: `at-${r.id}`,
                member: r.user?.name || 'Unknown',
                plan: member?.plan?.name || r.user?.role || 'Staff',
                time: r.checkIn ? r.checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                expiry: member?.expiryDate ? member.expiryDate.toISOString().split('T')[0] : null,
                balance: parseFloat(dues._sum.amount || 0),
                photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user?.name || 'U')}&background=6d28d9&color=fff&size=48`,
                timestamp: new Date(r.checkIn).getTime()
            };
        }));

        // Enrich hardware records
        const hardwareEnriched = await Promise.all(hardwareLogs.map(async (l) => {
            // Try to find member by personId (biometric key)
            // We search by personTenantId and personId (which is usually the member's unique code or ID)
            const member = await prisma.member.findFirst({
                where: { 
                    tenantId: l.personTenantId || whereClause.tenantId,
                    OR: [
                        { id: parseInt(l.personId) || -1 },
                        { uniqueCode: l.personId },
                        { memberId: l.personId }
                    ]
                },
                include: { plan: { select: { name: true } } }
            });

            const dues = member ? await prisma.invoice.aggregate({
                where: { memberId: member.id, status: { in: ['Unpaid', 'Partial'] } },
                _sum: { amount: true }
            }) : { _sum: { amount: 0 } };

            return {
                id: `hw-${l.id}`,
                member: l.personName || 'Stranger',
                plan: member?.plan?.name ? `Face: ${member.plan.name}` : `Face: ${l.deviceName || 'AIoT'}`,
                time: l.scanTime ? l.scanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                expiry: member?.expiryDate ? member.expiryDate.toISOString().split('T')[0] : null,
                balance: parseFloat(dues._sum.amount || 0),
                photo: l.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.personName || 'S')}&background=f43f5e&color=fff&size=48`,
                timestamp: new Date(l.scanTime).getTime()
            };
        }));

        const combined = [...manualEnriched, ...hardwareEnriched]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);

        res.json(combined);
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
