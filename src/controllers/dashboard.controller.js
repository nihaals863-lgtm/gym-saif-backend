const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getManagerDashboard = async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'] || req.query.tenantId ? parseInt(req.headers['x-tenant-id'] || req.query.tenantId) : req.user.tenantId;


        const [activeMembers, classesToday, paymentsDueInvoices, paymentsDuePayrolls] = await Promise.all([
            prisma.member.count({
                where: { tenantId, status: { in: ['Active', 'active'] } }
            }),
            prisma.class.count({
                where: { tenantId }
            }),
            prisma.invoice.count({
                where: { tenantId, status: { in: ['Overdue', 'unpaid', 'Unpaid'] } }
            }),
            prisma.payroll.count({
                where: { tenantId, status: 'Approved' }
            })
        ]);

        const paymentsDue = paymentsDueInvoices + paymentsDuePayrolls;

        // Financials
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch Today's Classes
        const currentDayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];
        const allClasses = await prisma.class.findMany({
            where: { tenantId, status: 'Scheduled' },
            include: { bookings: { where: { date: { gte: today, lt: tomorrow } } } }
        }).catch(() => []);

        // Filter classes scheduled for today
        const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
        const todaysRealClasses = allClasses.filter(cls => {
            try {
                const scheduleObj = JSON.parse(cls.schedule || "{}");
                // Check if it's an array format (old) or object with date (new)
                if (Array.isArray(scheduleObj)) {
                    return scheduleObj.some(s => s.day === currentDayName);
                } else {
                    return scheduleObj.date === todayStr;
                }
            } catch (e) {
                return false;
            }
        });

        // Use top 3 upcoming classes for the dashboard
        const attendance = todaysRealClasses.slice(0, 3).map(cls => {
            let timeStr = cls.startTime || '10:00 AM';
            try {
                const scheduleObj = JSON.parse(cls.schedule || "{}");
                if (Array.isArray(scheduleObj)) {
                    const sch = scheduleObj.find(s => s.day === currentDayName);
                    if (sch) timeStr = sch.time;
                } else if (scheduleObj.time) {
                    timeStr = scheduleObj.time;
                }
            } catch (e) {}
            
            return {
                id: cls.id,
                name: cls.name,
                time: timeStr,
                attendees: cls.bookings ? cls.bookings.length : 0,
                capacity: cls.maxCapacity || cls.capacity || 20
            };
        });

        // Fetch Tasks and Notices
        const [maintenanceTasks, pendingTasks] = await Promise.all([
            // 1. Maintenance Requests
            prisma.maintenanceRequest.findMany({
                where: { equipment: { tenantId }, status: { notIn: ['Resolved', 'Completed'] } },
                take: 2,
                include: { equipment: true }
            }).catch(() => []),
            // 2. Pending Standard Tasks assigned within tenant
            prisma.task.findMany({
                where: { tenantId, status: 'Pending' },
                take: 3,
                orderBy: { dueDate: 'asc' }
            }).catch(() => [])
        ]);

        const tasksAndNotices = [];

        pendingTasks.forEach(t => {
            tasksAndNotices.push({
                id: `t_${t.id}`,
                type: t.priority === 'High' ? 'urgent' : 'notice',
                title: t.title,
                description: t.description || 'Pending task completion.',
                dueDate: new Date(t.dueDate).toLocaleDateString()
            });
        });

        // Sort tasks globally by urgency
        tasksAndNotices.sort((a, b) => a.type === 'urgent' ? -1 : 1);

        const [todayInvoices, overdueInvoices, expenses, equipmentList] = await Promise.all([
            prisma.invoice.findMany({
                where: { tenantId, paidDate: { gte: today, lt: tomorrow } }
            }),
            prisma.invoice.findMany({
                where: { tenantId, status: { in: ['Overdue', 'unpaid', 'Unpaid'] } }
            }),
            prisma.expense.findMany({
                where: { tenantId, date: { gte: today, lt: tomorrow } }
            }).catch(() => []),
            prisma.equipment.findMany({
                where: { tenantId }
            }).catch(() => [])
        ]);

        const collectionToday = todayInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
        
        // Pending dues from payroll
        const overduePayrolls = await prisma.payroll.findMany({
            where: { tenantId, status: 'Approved' }
        });
        const pendingDuesAmount = overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0) + 
                             overduePayrolls.reduce((sum, p) => sum + Number(p.amount), 0);
        
        const localExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

        const totalAssets = equipmentList.length;
        const outOfOrder = equipmentList.filter(eq => eq.status === 'Maintenance' || eq.status === 'Broken').length;
        const operational = totalAssets - outOfOrder;

        res.json({
            activeMembers,
            classesToday,
            paymentsDue,
            attendance,
            collectionToday,
            pendingDuesAmount,
            localExpenses,
            equipmentStats: {
                totalAssets,
                operational,
                outOfOrder
            },
            tasksAndNotices
        });
    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getStaffDashboard = async (req, res) => {
    try {
        const tenantId = req.query.tenantId ? parseInt(req.query.tenantId) : req.user.tenantId;
        const staffId = req.user.id;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [
            checkinsToday,
            newEnquiriesToday,
            assignedTasks,
            pendingInvoiceCount,
            pendingPayrollCount,
            highPriorityTasks,
            upcomingClasses
        ] = await Promise.all([
            prisma.attendance.count({
                where: { tenantId, date: { gte: today, lt: tomorrow } }
            }),
            prisma.lead.count({
                where: { tenantId, status: 'New', createdAt: { gte: today, lt: tomorrow } }
            }),
            prisma.task.count({
                where: { assignedToId: staffId, status: 'Pending' }
            }),
            prisma.invoice.count({
                where: { tenantId, status: 'Unpaid' }
            }),
            prisma.payroll.count({
                where: { tenantId, status: 'Approved' } // Counts as Unpaid in Dashboard
            }),
            prisma.task.count({
                where: { assignedToId: staffId, status: 'Pending', priority: 'High' }
            }),
            prisma.class.count({
                where: { tenantId, status: 'Scheduled' }
            })
        ]);

        const pendingPayments = pendingInvoiceCount + pendingPayrollCount;

        // Pending Actions: Unpaid Invoices, Approved Payrolls & New Inquiries
        const [unpaidInvoices, approvedPayrolls, recentEnquiries] = await Promise.all([
            prisma.invoice.findMany({
                where: { tenantId, status: 'Unpaid' },
                take: 2,
                orderBy: { dueDate: 'asc' }
            }),
            prisma.payroll.findMany({
                where: { tenantId, status: 'Approved' },
                take: 2,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.lead.findMany({
                where: { tenantId, status: 'New' },
                take: 2,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        const pendingActions = [
            ...unpaidInvoices.map(inv => ({
                type: 'Payment',
                title: 'Payment Due',
                subtitle: `Invoice #${inv.invoiceNumber} (₹${inv.amount})`
            })),
            ...approvedPayrolls.map(p => ({
                type: 'Payroll',
                title: 'Payroll Approved',
                subtitle: `Salary for Staff (₹${p.amount})`
            })),
            ...recentEnquiries.map(enq => ({
                type: 'Enquiry',
                title: 'New Enquiry',
                subtitle: `${enq.name || 'Walk-in'} (${enq.phone || 'No phone'})`
            }))
        ];

        // Equipment Alerts
        const equipmentAlerts = await prisma.maintenanceRequest.findMany({
            where: { equipment: { tenantId }, status: { not: 'Resolved' } },
            take: 5,
            include: { equipment: true }
        });

        const formattedEquipmentAlerts = equipmentAlerts.map(req => ({
            id: req.id,
            equipmentId: req.equipment.id,
            equipmentName: req.equipment.name,
            issue: req.issue,
            priority: req.priority,
            status: req.status,
            reportedAt: req.createdAt,
        }));

        const todayInvoices = await prisma.invoice.findMany({
            where: { tenantId, paidDate: { gte: today, lt: tomorrow } }
        });
        const collectionToday = todayInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

        // Let's get actual staff shift or random default
        const todayShift = '09:00 - 17:00';

        const checkinRecords = await prisma.attendance.findMany({
            where: { tenantId, date: { gte: today } },
            take: 10,
            orderBy: { date: 'desc' },
            include: { user: true }
        });

        const memberUserIds = checkinRecords.map(c => c.userId).filter(id => id);
        const members = await prisma.member.findMany({
            where: { userId: { in: memberUserIds } },
            include: { plan: true }
        });

        const formattedCheckins = checkinRecords.map((c, i) => {
            const memberProfile = members.find(m => m.userId === c.userId);
            return {
                id: c.id,
                member: memberProfile?.name || c.user?.name || 'Unknown User',
                plan: memberProfile?.plan?.name || 'Walk-in / No Plan',
                expiry: memberProfile?.expiryDate ? new Date(memberProfile.expiryDate).toLocaleDateString() : 'N/A',
                balance: memberProfile?.wallet?.balance ? Number(memberProfile.wallet.balance) : 0,
                time: new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Allowed',
                photo: c.user?.avatar || `https://i.pravatar.cc/150?u=${c.userId}`
            };
        });

        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const expiringMemberships = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: today, lte: thirtyDaysFromNow }
            },
            take: 5,
            orderBy: { expiryDate: 'asc' },
            include: { plan: true }
        });

        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentlyExpiredMemberships = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: thirtyDaysAgo, lt: today }
            },
            take: 5,
            orderBy: { expiryDate: 'desc' },
            include: { plan: true }
        });

        const renewalAlerts = {
            expiringSoon: expiringMemberships.map(m => ({
                id: m.id,
                memberName: m.name || 'Unknown Member',
                planName: m.plan?.name || 'Unknown Plan',
                endDate: m.expiryDate
            })),
            recentlyExpired: recentlyExpiredMemberships.map(m => ({
                id: m.id,
                memberName: m.name || 'Unknown Member',
                planName: m.plan?.name || 'Unknown Plan',
                endDate: m.expiryDate
            }))
        };

        res.json({
            checkinsToday,
            pendingPayments,
            newEnquiries: newEnquiriesToday,
            activeUpdates: checkinsToday + newEnquiriesToday,
            todayShift,
            assignedTasks,
            highPriorityTasks,
            upcomingClasses,
            collectionToday,
            pendingActions,
            equipmentAlerts: formattedEquipmentAlerts.length > 0 ? formattedEquipmentAlerts : [/* fallback if needed via UI */],
            renewalAlerts,
            checkins: formattedCheckins.length > 0 ? formattedCheckins : []
        });
    } catch (error) {
        console.error('Staff Dashboard Error:', error);
        require('fs').writeFileSync('staff-dash-err.txt', error.stack || error.toString());
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getTrainerDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const trainerId = req.user.id;

        // 1. Basic Stats
        const members = await prisma.member.findMany({
            where: { tenantId, trainerId },
            include: {
                progress: {
                    orderBy: { date: 'desc' },
                    take: 1
                },
                dietPlans: { where: { status: 'Active' }, take: 1 },
                workoutPlans: { where: { status: 'Active' }, take: 1 }
            }
        });

        const totalMembers = members.length;

        // 2. Today's Schedule
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const classesToday = await prisma.class.findMany({
            where: {
                tenantId,
                trainerId,
                // In a real app, you'd check a Schedule/Session model
            }
        });

        // 3. Pending Plans (Members without workout or diet plan)
        const pendingPlans = members.filter(m => m.dietPlans.length === 0 || m.workoutPlans.length === 0).length;

        // 4. Format Schedule for Frontend
        const scheduleList = classesToday.map(c => ({
            id: c.id,
            time: '09:00 AM', // Mocked time as Class.schedule is Json
            name: c.name,
            type: 'Class',
            status: 'Upcoming',
            location: c.location || 'Main Floor'
        }));

        // 5. My Clients with Progress
        const myClients = members.map(m => {
            const latestProgress = m.progress[0];
            let progressPercent = 0;
            if (latestProgress && m.targetWeight && latestProgress.weight) {
                // If weight reduced towards target
                const startWeight = m.progress[m.progress.length - 1]?.weight || latestProgress.weight;
                const totalDiff = Math.abs(Number(startWeight) - Number(m.targetWeight));
                const currentDiff = Math.abs(Number(startWeight) - Number(latestProgress.weight));
                progressPercent = totalDiff > 0 ? Math.min(Math.round((currentDiff / totalDiff) * 100), 100) : 100;
            } else if (latestProgress) {
                progressPercent = 50;
            }

            return {
                id: m.id,
                name: m.name || 'Test Member',
                progress: progressPercent,
                lastVisit: latestProgress ? new Date(latestProgress.date).toLocaleDateString() : 'N/A',
                daysSinceLastVisit: latestProgress ? Math.floor((new Date() - new Date(latestProgress.date)) / (1000 * 60 * 60 * 24)) : 30,
                membership: 'Premium',
                phone: m.phone || 'N/A'
            };
        });

        // 6. Attendance Stats (Current Month)
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const attendanceRecords = await prisma.attendance.findMany({
            where: {
                userId: trainerId,
                date: { gte: startOfMonth }
            },
            orderBy: { date: 'asc' }
        });

        const presentDays = attendanceRecords.filter(r => r.status === 'Present').length;
        const lateDays = attendanceRecords.filter(r => r.status === 'Late').length;
        const absentDays = attendanceRecords.filter(r => r.status === 'Absent').length;

        // Generate Weekly Summary for the past 7 days
        const weeklySummary = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            const record = attendanceRecords.find(r =>
                new Date(r.date).toDateString() === d.toDateString()
            );
            weeklySummary.push({
                day: dayName.charAt(0), // Just M, T, W etc.
                status: record ? record.status : 'Off'
            });
        }

        const totalWorkingDays = presentDays + lateDays + absentDays;
        const attendanceRate = totalWorkingDays > 0 ? Math.round(((presentDays + lateDays) / totalWorkingDays) * 100) : 0;

        // 7. Pending Tasks
        const pendingDietPlansCount = members.filter(m => m.dietPlans.length === 0).length;
        const pendingWorkoutPlansCount = members.filter(m => m.workoutPlans.length === 0).length;
        const progressPendingCount = members.filter(m => m.progress.length === 0).length;

        const pendingTasks = [];
        if (pendingDietPlansCount > 0) pendingTasks.push({ id: 1, title: 'Members need Diet Plans', count: pendingDietPlansCount, route: '/diet-plans', type: 'Diet' });
        if (pendingWorkoutPlansCount > 0) pendingTasks.push({ id: 2, title: 'Members need Workout Plans', count: pendingWorkoutPlansCount, route: '/workout-plans', type: 'Workout' });
        if (progressPendingCount > 0) pendingTasks.push({ id: 3, title: 'Progress Logs Pending', count: progressPendingCount, route: '/progress', type: 'Progress' });

        // 8. Earnings (Based on User.baseSalary)
        const user = await prisma.user.findUnique({ where: { id: trainerId } });
        const salary = user.baseSalary ? Number(user.baseSalary) : 20000;
        const commission = totalMembers * 500; // Mocked commission: 500 per assigned member

        res.json({
            isCommissionBased: true,
            totalMembers,
            sessionsToday: classesToday.length,
            pendingPlans,
            todaySessions: {
                summary: {
                    total: classesToday.length,
                    upcoming: classesToday.filter(c => c.status === 'Scheduled').length,
                    completed: classesToday.filter(c => c.status === 'Completed').length
                },
                list: scheduleList
            },
            myClients,
            pendingTasks,
            myAttendance: {
                presentDays,
                lateDays,
                absentDays,
                attendanceRate,
                weeklySummary
            },
            earnings: {
                totalEarnings: salary + commission,
                commission,
                salary,
                target: 60000,
                pendingPayouts: commission
            }
        });
    } catch (error) {
        console.error('Trainer Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getMemberDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        // 1. Get Member Profile with Plan
        const member = await prisma.member.findUnique({
            where: { userId },
            include: {
                plan: true,
                tenant: true,
                bookings: {
                    where: { status: { in: ['Upcoming', 'Completed'] } },
                    include: { class: true }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // 2. Attendance Stats (Simplified logic)
        const totalBookings = await prisma.booking.count({
            where: { memberId: member.id }
        });
        const completedBookings = member.bookings.filter(b => b.status === 'Completed').length;
        const attendanceRate = totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0;

        // 3. Benefits (from Plan)
        const benefits = member.plan?.benefits || [];

        // 4. Announcements
        const announcements = await prisma.announcement.findMany({
            where: {
                OR: [
                    { tenantId },
                    { tenantId: null }
                ],
                targetRole: { in: ['all', 'member'] }
            },
            orderBy: { createdAt: 'desc' },
            take: 3
        });

        // 5. Next Class
        const upcomingBookings = member.bookings
            .filter(b => b.status === 'Upcoming')
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let nextClass = 'No Upcoming Classes';
        if (upcomingBookings.length > 0) {
            const b = upcomingBookings[0];
            const className = b.class?.name || 'Session';
            const time = b.class?.startTime || '';
            nextClass = `${className} ${time ? '@ ' + time : ''}`;
        }

        // 6. Calculate Days Remaining
        const daysRemaining = member.expiryDate ? Math.max(0, Math.floor((new Date(member.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

        res.json({
            planName: member.plan?.name || 'No Active Plan',
            nextClass,
            attendanceRate: `${attendanceRate}%`,
            planSummary: {
                workoutsCompleted: completedBookings,
                totalWorkouts: totalBookings || 20,
                nextGoal: member.fitnessGoal || 'Complete Week 1',
                membershipStatus: member.status,
                expiryDate: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : 'N/A',
                daysRemaining: daysRemaining
            },
            announcements: announcements.map(a => ({
                id: a.id,
                title: a.title,
                description: a.content,
                date: new Date(a.createdAt).toLocaleDateString(),
                isActive: true
            })),
            benefitWallet: {
                planName: member.plan?.name || "Standard",
                benefits: Array.isArray(benefits) ? benefits.map((b, i) => {
                    const name = (b.name || "").toLowerCase();
                    let used = 0;
                    if (name.includes('sauna')) {
                        used = member.bookings.filter(bk =>
                            (bk.class?.name || "").toLowerCase().includes('sauna') &&
                            new Date(bk.date) >= new Date(member.joinDate)
                        ).length;
                    } else if (name.includes('ice bath')) {
                        used = member.bookings.filter(bk =>
                            (bk.class?.name || "").toLowerCase().includes('ice bath') &&
                            new Date(bk.date) >= new Date(member.joinDate)
                        ).length;
                    } else if (name.includes('pt') || name.includes('class')) {
                        // Count other bookings as class credits
                        used = member.bookings.filter(bk => {
                            const cn = (bk.class?.name || "").toLowerCase();
                            const isCoreClass = !cn.includes('sauna') && !cn.includes('ice bath');
                            return isCoreClass && new Date(bk.date) >= new Date(member.joinDate);
                        }).length;
                    }

                    return {
                        id: i,
                        name: b.name || "Benefit",
                        total: b.limit || 0,
                        used: used,
                        label: "Items Left",
                        expiry: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : "2026-12-31"
                    };
                }) : []
            }
        });
    } catch (error) {
        console.error('Member Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
