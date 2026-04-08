const prisma = require('../config/prisma');

const getTodayRange = () => {
    const now = new Date();
    // Assuming IST (UTC+5.5) as the primary timezone for the gym
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    const start = new Date(istNow);
    start.setUTCHours(0, 0, 0, 0);
    const startUTC = new Date(start.getTime() - istOffset);

    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
    return { start: startUTC, end: endUTC };
};

const getPaymentHistory = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? { status: 'Paid' } : { tenantId, status: 'Paid' };
        const invoices = await prisma.invoice.findMany({
            where,
            orderBy: { paidDate: 'desc' }
        });
        const mapped = await Promise.all(invoices.map(async inv => {
            const member = await prisma.member.findUnique({ where: { id: inv.memberId } });
            return {
                id: inv.invoiceNumber,
                member: member?.name || 'Unknown',
                plan: 'N/A',
                amount: inv.amount,
                date: inv.paidDate || inv.dueDate,
                status: inv.status,
                mode: inv.paymentMode
            };
        }));
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const collectPayment = async (req, res) => {
    try {
        const { memberName, amount, paymentMode, plan } = req.body;
        const { tenantId, role } = req.user;

        if (!tenantId && role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID required' });
        }

        // Mocking an invoice creation for the collected payment. In a real system you need the exact memberId.
        const memberWhere = role === 'SUPER_ADMIN' ? { name: memberName } : { name: memberName, tenantId };
        const member = await prisma.member.findFirst({
            where: memberWhere
        });

        const invoice = await prisma.invoice.create({
            data: {
                tenantId: tenantId || member?.tenantId || 1,
                invoiceNumber: `INV-${Date.now()}`,
                memberId: member ? member.id : 1, // Fallback safely for now
                amount,
                paymentMode: paymentMode || 'Cash',
                status: 'Paid',
                dueDate: new Date(),
                paidDate: new Date()
            }
        });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const searchMembers = async (req, res) => {
    try {
        const { search } = req.query;
        if (!search) return res.json([]);
        const { tenantId, role } = req.user;

        const where = {
            OR: [
                { name: { contains: search } },
                { memberId: { contains: search } },
                { phone: { contains: search } }
            ]
        };

        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const members = await prisma.member.findMany({
            where,
            include: { plan: { select: { name: true } } },
            take: 10
        });

        res.json(members);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembers = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const { tenantId: qTenantId, branchId: qBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        // Priority: Query (tenantId or branchId) -> Header -> User's own tenant
        const rawTargetId = qTenantId || qBranchId || headerTenantId;
        const parsedTargetId = rawTargetId ? parseInt(rawTargetId) : NaN;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (!isNaN(parsedTargetId)) {
                where.tenantId = parsedTargetId;
            }
        } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            // Allow branch switch for these roles
            if (!isNaN(parsedTargetId)) {
                where.tenantId = parsedTargetId;
            } else {
                where.tenantId = userTenantId || 1;
            }
        } else {
            // For STAFF and others, force their own tenantId
            where.tenantId = userTenantId || 1;
        }

        console.log(`[getMembers] Fetching for tenantId: ${where.tenantId}, User role: ${role}`);

        const members = await prisma.member.findMany({
            where,
            include: { 
                tenant: { select: { name: true } },
                plan: true
            },
            orderBy: { name: 'asc' }
        });
        res.json(members);
    } catch (error) {
        console.error('[getMembers] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) },
            include: {
                trainer: true,
                tenant: true,
                plan: true,
                invoices: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });
        if (!member) return res.status(404).json({ message: 'Member not found' });
        
        // Formatting for frontend consistency
        const formatted = {
            ...member,
            healthConditions: member.medicalHistory,
            planName: member.plan?.name || 'No Plan',
            branch: member.tenant?.name || 'Main Branch',
            joinDate: member.joinDate ? member.joinDate.toISOString() : null,
            expiryDate: member.expiryDate ? member.expiryDate.toISOString() : null,
        };
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceReport = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const tenantFilter = role !== 'SUPER_ADMIN' ? `AND tenantId = ${tenantId}` : '';

        const result = await prisma.$queryRawUnsafe(`
            SELECT 
                DATE(checkIn) as date, 
                COUNT(*) as totalCheckIns, 
                COUNT(DISTINCT memberId) as uniqueMembers,
                HOUR(checkIn) as peakHour
            FROM attendance 
            WHERE type = 'Member' AND checkIn IS NOT NULL ${tenantFilter}
            GROUP BY DATE(checkIn)
            ORDER BY date DESC 
            LIMIT 7
        `);

        // Convert BigInt counts from queryRaw to Numbers
        const formatted = result.map(r => ({
            date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
            totalCheckIns: Number(r.totalCheckIns),
            uniqueMembers: Number(r.uniqueMembers),
            peakHour: r.peakHour !== null ? `${r.peakHour}:00` : 'N/A'
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingReport = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { class: { tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: { include: { trainer: true } } }
        });

        const mapped = bookings.map(b => ({
            id: `BK-${b.id}`,
            member: b.member?.name || 'Unknown',
            type: b.class?.name || 'Session',
            trainer: b.class?.trainer?.name || 'N/A',
            time: b.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: b.status
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkIn = async (req, res) => {
    try {
        const { memberId, userId, type } = req.body;
        const { tenantId } = req.user;

        if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized: No branch access' });
        }

        const { start, end } = getTodayRange();
        const checkInType = type || 'Member';

        // ── Trainer / Staff check-in ──
        if ((checkInType === 'Trainer' || checkInType === 'Staff') && userId) {
            const user = await prisma.user.findFirst({
                where: {
                    id: parseInt(userId),
                    ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
                }
            });
            if (!user) return res.status(404).json({ message: `${checkInType} not found in your branch` });
            if (user.status !== 'Active') return res.status(403).json({ message: `${checkInType} is currently ${user.status}` });

            const existing = await prisma.attendance.findFirst({
                where: {
                    userId: user.id,
                    checkIn: { gte: start, lt: end },
                    type: checkInType,
                    ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
                }
            });
            if (existing && !existing.checkOut) return res.status(400).json({ message: `${checkInType} already checked in` });
            if (existing && existing.checkOut) return res.status(400).json({ message: `${checkInType} can only check in once per day` });

            const attendance = await prisma.attendance.create({
                data: {
                    userId: user.id,
                    memberId: null,
                    type: checkInType,
                    checkIn: new Date(),
                    tenantId: tenantId || user.tenantId,
                    status: 'Present'
                }
            });
            return res.json({ success: true, message: `${checkInType} checked in successfully`, data: attendance });
        }

        // ── Member check-in (original flow) ──
        const member = await prisma.member.findFirst({
            where: {
                id: parseInt(memberId),
                ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
            },
            include: { plan: true }
        });

        if (!member) return res.status(404).json({ message: 'Member not found in your branch' });

        if (member.status === 'Expired') {
            return res.status(403).json({ message: 'Membership expired. Please renew.' });
        }
        if (member.status !== 'Active') {
            return res.status(403).json({ message: `Member is currently ${member.status}` });
        }

        const existingCheckIn = await prisma.attendance.findFirst({
            where: {
                memberId: member.id,
                checkIn: { gte: start, lt: end },
                type: 'Member',
                ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
            }
        });

        if (existingCheckIn && !existingCheckIn.checkOut) {
            return res.status(400).json({ message: 'Member already checked in and inside the gym' });
        }
        if (existingCheckIn && existingCheckIn.checkOut) {
            return res.status(400).json({ message: 'Member can only check in once per day' });
        }

        const attendance = await prisma.attendance.create({
            data: {
                memberId: member.id,
                userId: member.userId || null,
                type: 'Member',
                checkIn: new Date(),
                tenantId: tenantId || member.tenantId,
                status: 'Present'
            }
        });

        res.json({ success: true, message: 'Check-in successful', data: attendance });
    } catch (error) {
        console.error('[checkIn] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const checkOut = async (req, res) => {
    try {
        const { memberId, userId, type } = req.body;
        const { tenantId } = req.user;

        const checkOutType = type || 'Member';

        // ── Trainer / Staff check-out ──
        if ((checkOutType === 'Trainer' || checkOutType === 'Staff') && userId) {
            const activeAttendance = await prisma.attendance.findFirst({
                where: {
                    userId: parseInt(userId),
                    checkOut: null,
                    type: checkOutType,
                    ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
                },
                orderBy: { checkIn: 'desc' }
            });
            if (!activeAttendance) return res.status(400).json({ message: `No active check-in found for this ${checkOutType.toLowerCase()}` });

            await prisma.attendance.update({
                where: { id: activeAttendance.id },
                data: { checkOut: new Date() }
            });
            return res.json({ success: true, message: `${checkOutType} checked out successfully` });
        }

        // ── Member check-out (original flow) ──
        const activeAttendance = await prisma.attendance.findFirst({
            where: {
                memberId: parseInt(memberId),
                checkOut: null,
                type: 'Member',
                ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
            },
            orderBy: { checkIn: 'desc' }
        });

        if (!activeAttendance) {
            return res.status(400).json({ message: 'No active check-in found for this member in your branch' });
        }

        await prisma.attendance.update({
            where: { id: activeAttendance.id },
            data: { checkOut: new Date() }
        });

        res.json({ success: true, message: 'Checked out successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTodaysCheckIns = async (req, res) => {
    try {
        const { start, end } = getTodayRange();

        const tenantId = req.user.tenantId;

        const where = {
            checkIn: { gte: start, lt: end }
        };

        if (req.user.role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const checkIns = await prisma.attendance.findMany({
            where,
            include: { 
                member: { include: { plan: true } },
                user: true
            },
            orderBy: { checkIn: 'desc' }
        });

        const formatted = checkIns.map(c => {
            const m = c.member;
            const u = c.user;
            const name = m ? m.name : (u ? u.name : 'Unknown');
            const code = m ? m.memberId : (u ? (u.employeeCode || u.role) : 'N/A');
            const personType = c.type;
            
            const checkInTime = new Date(c.checkIn);
            const checkOutTime = c.checkOut ? new Date(c.checkOut) : null;

            let duration = '-';
            if (checkInTime) {
                const endT = checkOutTime || new Date();
                const diffMs = endT - checkInTime;
                const diffMins = Math.floor(diffMs / 60000);
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            }

            return {
                id: c.id,
                name,
                code,
                personType,
                in: checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                out: checkOutTime ? checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: c.checkOut ? 'Checked-Out' : 'Inside',
                duration: duration,
                memberId: m ? m.id : null,
                userId: u ? u.id : null,
                plan: m?.plan?.name || (personType !== 'Member' ? '-' : 'No Plan'),
                checkInPayload: m ? { memberId: m.id, type: 'Member' } : { userId: u.id, type: personType }
            };
        });

        const currentlyIn = formatted.filter(f => f.status === 'Inside');
        const checkedOutCount = formatted.filter(f => f.status === 'Checked-Out').length;

        const allActiveMembers = await prisma.member.findMany({
            where: {
                tenantId: req.user.role !== 'SUPER_ADMIN' ? tenantId : undefined,
                status: 'Active'
            },
            select: { id: true, name: true, memberId: true }
        });

        const checkedInMemberIds = new Set(checkIns.map(c => c.memberId));
        const absentMembers = allActiveMembers
            .filter(m => !checkedInMemberIds.has(m.id))
            .map(m => ({
                id: `abs-${m.id}`,
                name: m.name,
                code: m.memberId || 'N/A',
                status: 'Absent',
                memberId: m.id
            }));

        res.json({
            currentlyIn: currentlyIn,
            history: formatted,
            absent: absentMembers,
            stats: {
                total: formatted.length,
                inside: currentlyIn.length,
                checkedOut: checkedOutCount,
                absent: absentMembers.length
            }
        });
    } catch (error) {
        console.error('[getTodaysCheckIns] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getTasks = async (req, res) => {
    try {
        const { myTasks, status, search } = req.query;
        const { id: userId, tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        // Security: For STAFF, TRAINER, MEMBER - always use their assigned tenantId.
        // Only SUPER_ADMIN and BRANCH_ADMIN/MANAGER can potentially override via header.
        if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role)) {
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') {
                const parsed = parseInt(headerTenantId);
                if (!isNaN(parsed)) tenantIdToUse = parsed;
            }
        }

        let where = {};

        // Security: Always limit by tenant for non-SUPER_ADMIN
        if (role !== 'SUPER_ADMIN') {
            if (!tenantIdToUse) {
                console.warn(`[StaffTasks] No tenantId for user ${userId}`);
                return res.json([]);
            }
            where.tenantId = tenantIdToUse;
        }

        if (myTasks === 'true') {
            where.OR = [
                { assignedToId: userId },
                { staffId: userId }
            ];
        }

        if (status && status !== 'All' && status !== 'All Status') {
            if (status === 'Overdue') {
                where.status = { not: 'Completed', notIn: ['Approved'] };
                where.dueDate = { lt: new Date() };
            } else {
                where.status = status;
            }
        }
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } }
            ];
        }

        console.log(`[StaffTasks] Role: ${role}, UserID: ${userId}, TenantID: ${tenantIdToUse}, Where:`, JSON.stringify(where));

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                manager: { select: { id: true, name: true } },
                staff: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        const formatted = tasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            assignedTo: t.staff?.name || t.assignedTo?.name || 'Unassigned',
            assignedToId: t.staffId || t.assignedToId,
            assignedBy: t.manager?.name || t.creator?.name || 'Admin',
            priority: t.priority,
            due: t.staffDeadline || t.dueDate,
            overallDueDate: t.dueDate,
            status: t.status,
            delegationNote: t.delegationNote || '',
            updated: 'Recently'
        }));

        res.json(formatted);
    } catch (error) {
        console.error('[StaffTasks] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        const { title, description, assignedToId, priority, due_date } = req.body;
        const { id: creatorId, tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        // Only allow header override if Super Admin or Branch Admin/Manager
        if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role)) {
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') {
                const parsed = parseInt(headerTenantId);
                if (!isNaN(parsed)) tenantIdToUse = parsed;
            }
        }

        if (!tenantIdToUse && role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized: No branch associated with this user' });
        }

        console.log(`[createTask] Role: ${role}, UserID: ${creatorId}, TenantID: ${tenantIdToUse}`);

        const task = await prisma.task.create({
            data: {
                title,
                description,
                priority: priority || 'Medium',
                dueDate: due_date ? new Date(due_date) : new Date(),
                assignedToId: assignedToId ? parseInt(assignedToId) : creatorId,
                creatorId,
                tenantId: tenantIdToUse || 1,
                status: 'Pending'
            }
        });
        res.status(201).json(task);
    } catch (error) {
        console.error('[createTask] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getBranchTeam = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role)) {
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') {
                const parsed = parseInt(headerTenantId);
                if (!isNaN(parsed)) tenantIdToUse = parsed;
            }
        }

        if (!tenantIdToUse) return res.json([]);

        const users = await prisma.user.findMany({
            where: {
                tenantId: tenantIdToUse,
                role: { not: 'MEMBER' },
                status: 'Active'
            },
            select: { id: true, name: true, role: true }
        });
        res.json(users);
    } catch (error) {
        console.error('[getBranchTeam] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getMyBranch = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role)) {
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') {
                const parsed = parseInt(headerTenantId);
                if (!isNaN(parsed)) tenantIdToUse = parsed;
            }
        }

        if (!tenantIdToUse) return res.json(null);

        const branch = await prisma.tenant.findUnique({
            where: { id: tenantIdToUse },
            select: { id: true, name: true }
        });
        res.json(branch);
    } catch (error) {
        console.error('[getMyBranch] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getTaskStats = async (req, res) => {
    try {
        const { id: userId, tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role)) {
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') {
                const parsed = parseInt(headerTenantId);
                if (!isNaN(parsed)) tenantIdToUse = parsed;
            }
        }

        let where = {};
        if (role !== 'SUPER_ADMIN') {
            if (!tenantIdToUse) {
                return res.json({ total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 });
            }
            where.tenantId = tenantIdToUse;
        }

        const [total, pending, inProgress, completed, overdue] = await Promise.all([
            prisma.task.count({ where }),
            prisma.task.count({ where: { ...where, status: 'Pending' } }),
            prisma.task.count({ where: { ...where, status: 'In Progress' } }),
            prisma.task.count({ where: { ...where, status: 'Completed' } }),
            prisma.task.count({
                where: {
                    ...where,
                    status: { notIn: ['Completed', 'Approved'] },
                    dueDate: { lt: new Date() }
                }
            })
        ]);

        res.json({ total, pending, inProgress, completed, overdue });
    } catch (error) {
        console.error('[getTaskStats] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const task = await prisma.task.update({
            where: { id: parseInt(id) },
            data: { status },
            include: { creator: true, manager: true }
        });

        // Notification: Notify Creator/Manager when status changes (especially Completed)
        if (status === 'Completed' || status === 'In Progress') {
            const notifyIds = [task.creatorId, task.managerId].filter(uid => uid && uid !== req.user.id);
            for (const uid of [...new Set(notifyIds)]) {
                try {
                    await prisma.notification.create({
                        data: {
                            userId: uid,
                            title: `Task Update: ${status}`,
                            message: `Staff has updated "${task.title}" to ${status}.`,
                            type: status === 'Completed' ? 'success' : 'info',
                            link: '/dashboard'
                        }
                    });
                } catch (err) { console.error('Notify Error:', err); }
            }
        }

        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, role } = req.user;

        const task = await prisma.task.findUnique({ where: { id: parseInt(id) } });
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Security: Allow creator, admin, or the assigned person (if task is completed) to delete.
        const canDelete = role === 'SUPER_ADMIN' || 
                         role === 'BRANCH_ADMIN' || 
                         role === 'MANAGER' || 
                         task.creatorId === userId || 
                         (task.assignedToId === userId && task.status === 'Completed');

        if (!canDelete) {
            return res.status(403).json({ message: 'Unauthorized: You do not have permission to delete this task' });
        }

        await prisma.task.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        const task = await prisma.task.findUnique({
            where: { id: parseInt(id) },
            include: {
                assignedTo: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } }
            }
        });
        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json({
            id: task.id,
            title: task.title,
            description: task.description || '',
            assignedTo: task.assignedTo?.name || 'Unassigned',
            assignedBy: task.creator?.name || 'Admin',
            priority: task.priority,
            due: task.dueDate,
            status: task.status
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getLockers = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const { branchId: qBranchId, tenantId: qTenantId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        const rawTargetId = qBranchId || qTenantId || headerTenantId;

        const where = {};

        if (role === 'SUPER_ADMIN') {
            if (rawTargetId && rawTargetId !== 'all' && rawTargetId !== 'undefined' && rawTargetId !== 'null') {
                where.tenantId = parseInt(rawTargetId);
            }
        } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            if (rawTargetId && rawTargetId !== 'all' && rawTargetId !== 'undefined' && rawTargetId !== 'null') {
                where.tenantId = parseInt(rawTargetId);
            } else {
                // If 'all', show all branches managed by this user
                where.tenant = {
                    OR: [
                        { id: userTenantId },
                        { owner: req.user.email },
                        { owner: req.user.name }
                    ]
                };
            }
        } else {
            where.tenantId = userTenantId;
        }

        const lockers = await prisma.locker.findMany({
            where: where,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        memberId: true,
                        phone: true
                    }
                }
            },
            orderBy: { number: 'asc' }
        });
        res.json(lockers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { memberId, memberName, isPaid, notes, price } = req.body;
        const { tenantId: userTenantId } = req.user;

        console.log('[LockerAssign] Received Request:', { id, memberId, memberName, isPaid, notes, price });

        const targetPrice = parseFloat(price) || 0;
        const billingEnabled = isPaid === true || isPaid === 'true';

        console.log('[LockerAssign] Processing Logic:', { targetPrice, billingEnabled });

        // Fetch member to get their tenantId for invoice creation
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });

        if (!member) {
            console.error('[LockerAssign] Member not found:', memberId);
            return res.status(404).json({ message: 'Member not found' });
        }

        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: billingEnabled ? 'Reserved' : 'Assigned',
                assignedToId: parseInt(memberId),
                isPaid: billingEnabled,
                price: targetPrice,
                notes: notes || undefined
            }
        });

        console.log('[LockerAssign] Locker Updated:', updated.id, 'Status:', updated.status);

        // Create Invoice if billing is enabled
        if (billingEnabled && targetPrice > 0) {
            console.log('[LockerAssign] Creating Invoice...');
            await prisma.invoice.create({
                data: {
                    tenantId: member.tenantId || userTenantId || updated.tenantId || 1,
                    invoiceNumber: `INV-LCK-${Date.now()}`,
                    memberId: member.id,
                    amount: targetPrice,
                    subtotal: targetPrice,
                    balance: targetPrice,
                    paidAmount: 0,
                    taxRate: 0,
                    taxAmount: 0,
                    discount: 0,
                    status: 'Unpaid',
                    dueDate: new Date(),
                    paymentMode: 'Cash',
                    notes: `Locker Assignment: #${updated.number}`,
                    items: {
                        create: [{
                            description: `Monthly Locker Fee: #${updated.number}`,
                            quantity: 1,
                            rate: targetPrice,
                            amount: targetPrice
                        }]
                    }
                }
            });
            console.log('[LockerAssign] Invoice Created Successfully');
        } else {
            console.log('[LockerAssign] Skipping Invoice Creation. BillingEnabled:', billingEnabled, 'TargetPrice:', targetPrice);
        }

        res.json(updated);
    } catch (error) {
        console.error('[LockerAssign] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const releaseLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: { status: 'Available', assignedToId: null, isPaid: false }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addLocker = async (req, res) => {
    try {
        const { number, size, area, notes, isChargeable, price, status, tenantId: bodyTenantId } = req.body;
        const { tenantId: userTenantId, role } = req.user;

        const targetTenantId = bodyTenantId || userTenantId;

        if (targetTenantId === 'all' && (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN')) {
            let tenantWhere = { status: 'Active' };
            if (role === 'BRANCH_ADMIN') {
                tenantWhere = {
                    status: 'Active',
                    OR: [
                        { id: userTenantId },
                        { owner: req.user.email },
                        { owner: req.user.name }
                    ]
                };
            }

            const tenants = await prisma.tenant.findMany({
                where: tenantWhere,
                select: { id: true }
            });

            const lockers = await Promise.all(
                tenants.map(tenant =>
                    prisma.locker.create({
                        data: {
                            tenantId: tenant.id,
                            number,
                            size: size || 'Medium',
                            area: area || null,
                            notes: notes || null,
                            isChargeable: isChargeable || false,
                            price: isChargeable ? parseFloat(price || 0) : 0,
                            status: status || 'Available'
                        }
                    })
                )
            );
            return res.status(201).json({ success: true, message: `Locker created in ${lockers.length} branches`, data: lockers[0] });
        }

        const newLocker = await prisma.locker.create({
            data: {
                number,
                size: size || 'Medium',
                area: area || null,
                notes: notes || null,
                isChargeable: isChargeable || false,
                price: isChargeable ? parseFloat(price || 0) : 0,
                status: status || 'Available',
                tenantId: (targetTenantId && targetTenantId !== 'all') ? parseInt(targetTenantId) : (userTenantId || 1)
            }
        });
        res.json({ success: true, data: newLocker });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const bulkCreateLockers = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const { prefix, startNumber, endNumber, size, isChargeable, price, area, tenantId: bodyTenantId } = req.body;

        const targetTenantId = bodyTenantId || userTenantId;

        if (targetTenantId === 'all' && (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN')) {
            let tenantWhere = { status: 'Active' };
            if (role === 'BRANCH_ADMIN') {
                tenantWhere = {
                    status: 'Active',
                    OR: [
                        { id: userTenantId },
                        { owner: req.user.email },
                        { owner: req.user.name }
                    ]
                };
            }

            const tenants = await prisma.tenant.findMany({
                where: tenantWhere,
                select: { id: true }
            });

            let totalCreated = 0;
            for (const tenant of tenants) {
                const lockersData = [];
                for (let i = parseInt(startNumber); i <= parseInt(endNumber); i++) {
                    const num = i.toString().padStart(3, '0');
                    lockersData.push({
                        number: `${prefix}${num}`,
                        size: size || 'Medium',
                        isChargeable: isChargeable || false,
                        price: isChargeable ? parseFloat(price || 0) : 0,
                        area: area || '',
                        status: 'Available',
                        tenantId: tenant.id
                    });
                }
                await prisma.locker.createMany({ data: lockersData });
                totalCreated += lockersData.length;
            }

            return res.status(201).json({ success: true, message: `${totalCreated} lockers created across ${tenants.length} branches` });
        }

        const currentTenantId = (targetTenantId && targetTenantId !== 'all') ? parseInt(targetTenantId) : (userTenantId || 1);

        const lockersData = [];
        for (let i = parseInt(startNumber); i <= parseInt(endNumber); i++) {
            const num = i.toString().padStart(3, '0');
            lockersData.push({
                number: `${prefix}${num}`,
                size: size || 'Medium',
                isChargeable: isChargeable || false,
                price: isChargeable ? parseFloat(price || 0) : 0,
                area: area || '',
                status: 'Available',
                tenantId: currentTenantId
            });
        }

        await prisma.locker.createMany({
            data: lockersData
        });

        res.status(201).json({ success: true, message: `${lockersData.length} lockers created successfully` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const transferMembership = async (req, res) => {
    try {
        const { fromMemberId, toMemberId, toBranchId, notes } = req.body;
        const { tenantId: userTenantId } = req.user;

        const fromMember = await prisma.member.findUnique({
            where: { id: parseInt(fromMemberId) },
            include: { plan: true }
        });

        if (!fromMember) return res.status(404).json({ message: 'Current member not found' });
        if (!fromMember.plan) return res.status(400).json({ message: 'Member has no active plan' });
        if (!fromMember.plan.allowTransfer) return res.status(403).json({ message: 'Plan does not allow transfer' });
        if (fromMember.status !== 'Active') return res.status(400).json({ message: 'Only active memberships can be transferred' });

        const today = new Date();
        const expiry = new Date(fromMember.expiryDate);
        if (expiry <= today) return res.status(400).json({ message: 'Membership already expired' });

        const remainingMs = expiry.getTime() - today.getTime();
        const remainingDays = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

        const toMember = await prisma.member.findUnique({
            where: { id: parseInt(toMemberId) }
        });

        if (!toMember) return res.status(404).json({ message: 'Receiver member not found' });
        if (toMember.id === fromMember.id) return res.status(400).json({ message: 'Cannot transfer to the same member' });
        
        // Allowed only if receiver doesn't have an active plan or it's expired
        if (toMember.status === 'Active' && toMember.planId) {
             return res.status(400).json({ message: 'Receiver already has an active membership' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const transferLog = await tx.membershipTransfer.create({
                data: {
                    tenantId: userTenantId || fromMember.tenantId,
                    fromMemberId: fromMember.id,
                    toMemberId: toMember.id,
                    planId: fromMember.planId,
                    remainingDays: remainingDays,
                    fromBranchId: fromMember.tenantId,
                    toBranchId: parseInt(toBranchId) || fromMember.tenantId,
                    notes: notes || `Transfer from ${fromMember.name} (ID: ${fromMember.memberId}) to ${toMember.name} (ID: ${toMember.memberId})`
                }
            });

            await tx.member.update({
                where: { id: fromMember.id },
                data: {
                    status: 'Transferred',
                    planId: null,
                    expiryDate: null
                }
            });

            const newExpiry = new Date();
            newExpiry.setDate(newExpiry.getDate() + remainingDays);

            await tx.member.update({
                where: { id: toMember.id },
                data: {
                    status: 'Active',
                    planId: fromMember.planId,
                    expiryDate: newExpiry,
                    isTransferred: true,
                    transferredFromId: fromMember.id,
                    transferDate: new Date(),
                    tenantId: parseInt(toBranchId) || toMember.tenantId
                }
            });

            // Audit Log
            await tx.auditLog.create({
                data: {
                    userId: req.user.id,
                    action: 'Membership Transfer',
                    module: 'Memberships',
                    details: `Transferred ${fromMember.plan.name} from member ${fromMember.id} to ${toMember.id}`,
                    ip: req.ip || '0.0.0.0',
                    status: 'Success'
                }
            });

            return transferLog;
        });

        res.json({ success: true, message: 'Membership transferred successfully', data: result });
    } catch (error) {
        console.error('[transferMembership] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const addMember = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const {
            name, email, phone, gender, dob, source, address,
            referralCode, idType, idNumber,
            emergencyName, emergencyPhone,
            fitnessGoal, healthConditions,
            planId, trainerId, startDate, benefits, avatar, duration
        } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({ message: 'Name, email and phone are required' });
        }

        const targetTenantId = tenantId || 1;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);

        // Check for existing user
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ message: `A user with email ${email} already exists.` });
        }

        // Create User Record
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone,
                role: 'MEMBER',
                tenantId: targetTenantId,
                status: 'Active',
                avatar: avatar || null,
                address: address || null
            }
        });

        // Calculate Plan Details
        let planObj = null;
        if (planId) {
            planObj = await prisma.membershipPlan.findFirst({
                where: { id: parseInt(planId), tenantId: targetTenantId }
            });
        }

        const joinDate = startDate ? new Date(startDate) : new Date();
        let expiryDate = null;
        let finalPrice = 0;
        const cycleMultiplier = parseInt(duration) || 1;

        if (planObj) {
            expiryDate = new Date(joinDate);
            const totalDurationParam = planObj.duration * cycleMultiplier;

            if (planObj.durationType === 'Days') {
                expiryDate.setDate(expiryDate.getDate() + totalDurationParam);
            } else if (planObj.durationType === 'Weeks') {
                expiryDate.setDate(expiryDate.getDate() + (totalDurationParam * 7));
            } else if (planObj.durationType === 'Years') {
                expiryDate.setFullYear(expiryDate.getFullYear() + totalDurationParam);
            } else {
                expiryDate.setMonth(expiryDate.getMonth() + totalDurationParam);
            }
            finalPrice = parseFloat(planObj.price) * cycleMultiplier;
        }

        // Create Member Record
        const member = await prisma.member.create({
            data: {
                memberId: `MEM-${Date.now()}-${targetTenantId}`,
                userId: newUser.id,
                tenantId: targetTenantId,
                name,
                email,
                phone,
                planId: planId ? parseInt(planId) : null,
                status: 'Active',
                avatar: avatar || null,
                gender,
                dob,
                source: source || 'Walk-in',
                idType,
                idNumber,
                referralCode,
                address,
                emergencyName,
                emergencyPhone,
                fitnessGoal,
                medicalHistory: healthConditions,
                joinDate: joinDate,
                expiryDate: expiryDate,
                benefits: Array.isArray(benefits) ? JSON.stringify(benefits) : (benefits || null),
                trainerId: trainerId ? parseInt(trainerId) : null
            }
        });

        // Create Invoice if Plan Selected
        if (planObj) {
            await prisma.invoice.create({
                data: {
                    tenantId: targetTenantId,
                    invoiceNumber: `INV-${Date.now()}-${targetTenantId}`,
                    memberId: member.id,
                    amount: finalPrice,
                    subtotal: finalPrice,
                    paymentMode: 'Cash',
                    status: 'Unpaid',
                    dueDate: new Date(),
                    items: {
                        create: [{
                            description: `Membership Plan: ${planObj.name} (${cycleMultiplier} ${planObj.durationType === 'Months' ? 'Cycles' : planObj.durationType})`,
                            quantity: 1,
                            rate: finalPrice,
                            amount: finalPrice
                        }]
                    }
                }
            });
        }

        res.status(201).json(member);
    } catch (error) {
        console.error('[addMember staff]', error);
        res.status(500).json({ message: error.message });
    }
};

const getMyAttendance = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const { start, end } = getTodayRange();

        const logs = await prisma.attendance.findMany({
            where: {
                userId: id,
                checkIn: { gte: start, lt: end },
                type: { not: 'Member' }
            },
            orderBy: { checkIn: 'desc' }
        });

        const activeShift = logs.find(l => !l.checkOut);

        // Branch Stats
        const branchStats = await Promise.all([
            prisma.attendance.count({
                where: { tenantId, checkOut: null, type: { not: 'Member' }, checkIn: { gte: start, lt: end } }
            }),
            prisma.attendance.count({
                where: { tenantId, type: { not: 'Member' }, checkIn: { gte: start, lt: end } }
            }),
            prisma.attendance.count({
                where: { tenantId, checkOut: { not: null }, type: { not: 'Member' }, checkIn: { gte: start, lt: end } }
            })
        ]);

        res.json({
            logs: logs.map(l => ({
                id: l.id,
                checkIn: l.checkIn,
                checkOut: l.checkOut,
                status: l.status,
                name: req.user.name
            })),
            activeShift: activeShift ? {
                id: activeShift.id,
                checkIn: activeShift.checkIn,
                name: req.user.name
            } : null,
            stats: {
                currentlyWorking: branchStats[0],
                todayCheckIns: branchStats[1],
                completedShifts: branchStats[2]
            }
        });
    } catch (error) {
        console.error('[getMyAttendance]', error);
        res.status(500).json({ message: error.message });
    }
};

const recordAttendance = async (req, res) => {
    try {
        const { id, tenantId, role } = req.user;
        const { start, end } = getTodayRange();

        const existingLog = await prisma.attendance.findFirst({
            where: {
                userId: id,
                checkIn: { gte: start, lt: end },
                type: { not: 'Member' }
            }
        });

        if (!existingLog) {
            // Check-in
            const log = await prisma.attendance.create({
                data: {
                    userId: id,
                    tenantId: tenantId || 1,
                    type: role,
                    checkIn: new Date(),
                    date: start,
                    status: 'Present'
                }
            });
            return res.json({ message: 'Checked in successfully', data: log });
        } else if (!existingLog.checkOut) {
            // Check-out
            const log = await prisma.attendance.update({
                where: { id: existingLog.id },
                data: { checkOut: new Date() }
            });
            return res.json({ message: 'Checked out successfully', data: log });
        } else {
            return res.status(400).json({ message: 'You have already completed your shift for today' });
        }
    } catch (error) {
        console.error('[recordAttendance]', error);
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceHistory = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { startDate, endDate, search } = req.query;

        // Build date range
        const from = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        const to = endDate ? new Date(endDate) : new Date();
        to.setHours(23, 59, 59, 999);

        const where = {
            type: 'Member',
            checkIn: { gte: from, lte: to }
        };

        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const records = await prisma.attendance.findMany({
            where,
            include: { member: { include: { plan: { select: { name: true } } } } },
            orderBy: { checkIn: 'desc' },
            take: 500
        });

        const formatted = records
            .filter(r => {
                if (!search) return true;
                const m = r.member;
                const q = search.toLowerCase();
                return (m?.name || '').toLowerCase().includes(q) || (m?.memberId || '').toLowerCase().includes(q);
            })
            .map(r => {
                const m = r.member || {};
                const checkInTime = new Date(r.checkIn);
                const checkOutTime = r.checkOut ? new Date(r.checkOut) : null;
                let duration = '-';
                if (checkInTime) {
                    const endT = checkOutTime || new Date();
                    const diffMins = Math.floor((endT - checkInTime) / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                }
                return {
                    id: r.id,
                    name: m.name || 'Unknown',
                    code: m.memberId || 'N/A',
                    plan: m.plan?.name || '-',
                    date: checkInTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                    in: checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    out: checkOutTime ? checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                    duration,
                    status: r.checkOut ? 'Completed' : 'Inside'
                };
            });

        res.json({ records: formatted, total: formatted.length });
    } catch (error) {
        console.error('[getAttendanceHistory] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// ── Unified search: Members + Trainers + Staff for attendance check-in ──
const searchAllForAttendance = async (req, res) => {
    try {
        const { search, branchId } = req.query;
        const { tenantId, role } = req.user;

        if (!search || search.trim().length < 2) {
            return res.json({ data: [] });
        }

        const effectiveTenantId = (branchId && branchId !== 'all') ? parseInt(branchId) :
            (role === 'SUPER_ADMIN' ? undefined : tenantId);

        const tenantFilter = effectiveTenantId ? { tenantId: effectiveTenantId } : {};
        const searchStr = search.trim();

        // Parallel search: members + users (trainers/staff)
        const [members, users] = await Promise.all([
            prisma.member.findMany({
                where: {
                    ...tenantFilter,
                    status: 'Active',
                    OR: [
                        { name: { contains: searchStr } },
                        { memberId: { contains: searchStr } },
                        { phone: { contains: searchStr } }
                    ]
                },
                select: { id: true, name: true, memberId: true, status: true, avatar: true, phone: true },
                take: 8
            }),
            prisma.user.findMany({
                where: {
                    ...tenantFilter,
                    status: 'Active',
                    role: { in: ['TRAINER', 'STAFF'] },
                    OR: [
                        { name: { contains: searchStr } },
                        { phone: { contains: searchStr } },
                        { employeeCode: { contains: searchStr } }
                    ]
                },
                select: { id: true, name: true, role: true, status: true, avatar: true, phone: true, employeeCode: true },
                take: 8
            })
        ]);

        const results = [
            ...members.map(m => ({
                id: m.id,
                name: m.name,
                code: m.memberId,
                phone: m.phone,
                status: m.status,
                avatar: m.avatar,
                personType: 'Member',
                checkInPayload: { memberId: m.id, type: 'Member' }
            })),
            ...users.map(u => ({
                id: u.id,
                name: u.name,
                code: u.employeeCode || u.role,
                phone: u.phone,
                status: u.status,
                avatar: u.avatar,
                personType: u.role === 'TRAINER' ? 'Trainer' : 'Staff',
                checkInPayload: { userId: u.id, type: u.role === 'TRAINER' ? 'Trainer' : 'Staff' }
            }))
        ];

        res.json({ data: results });
    } catch (error) {
        console.error('[searchAllForAttendance] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
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
    getAttendanceHistory,
    transferMembership
};
