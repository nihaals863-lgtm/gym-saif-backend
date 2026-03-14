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
            where: { id: parseInt(id) }
        });
        if (!member) return res.status(404).json({ message: 'Member not found' });
        res.json(member);
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
        const { memberId } = req.body;
        const { tenantId } = req.user;

        if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized: No branch access' });
        }

        const member = await prisma.member.findFirst({
            where: {
                id: parseInt(memberId),
                ...(req.user.role !== 'SUPER_ADMIN' ? { tenantId } : {})
            },
            include: { plan: true }
        });

        if (!member) return res.status(404).json({ message: 'Member not found in your branch' });

        // Production-grade checks
        if (member.status === 'Expired') {
            return res.status(403).json({ message: 'Membership expired. Please renew.' });
        }
        if (member.status !== 'Active') {
            return res.status(403).json({ message: `Member is currently ${member.status}` });
        }

        // Check if already checked in today
        const { start, end } = getTodayRange();
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

        // Rule: Only once per day (as requested by user)
        if (existingCheckIn && existingCheckIn.checkOut) {
            return res.status(400).json({ message: 'Member can only check in once per day' });
        }

        const attendance = await prisma.attendance.create({
            data: {
                memberId: member.id,
                userId: member.userId || null,
                type: 'Member',
                checkIn: new Date(),
                tenantId: tenantId || member.tenantId, // Fallback to member's tenant if super admin
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
        const { memberId } = req.body;
        const { tenantId } = req.user;

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
            checkIn: { gte: start, lt: end },
            type: 'Member'
        };

        if (req.user.role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const checkIns = await prisma.attendance.findMany({
            where,
            include: { member: { include: { plan: true } } },
            orderBy: { checkIn: 'desc' }
        });

        const formatted = checkIns.map(c => {
            const m = c.member || {};
            const checkInTime = new Date(c.checkIn);
            const checkOutTime = c.checkOut ? new Date(c.checkOut) : null;

            let duration = '-';
            if (checkInTime) {
                const end = checkOutTime || new Date();
                const diffMs = end - checkInTime;
                const diffMins = Math.floor(diffMs / 60000);
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            }

            return {
                id: c.id,
                name: m.name || 'Unknown',
                code: m.memberId || 'N/A',
                in: checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                out: checkOutTime ? checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: c.checkOut ? 'Checked-Out' : 'Inside',
                duration: duration,
                memberId: m.id,
                plan: m.plan?.name || 'No Plan'
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
        const { memberId, memberName, isPaid, notes } = req.body;

        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Assigned',
                assignedToId: parseInt(memberId),
                isPaid: isPaid ?? false,
                notes: notes || undefined
            }
        });
        res.json(updated);
    } catch (error) {
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

const addMember = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const {
            name, email, phone, gender, dob, source, address,
            referralCode, idType, idNumber,
            emergencyName, emergencyPhone,
            fitnessGoal, healthConditions
        } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({ message: 'Name, email and phone are required' });
        }

        const targetTenantId = tenantId || 1;

        // Generate unique memberId
        const count = await prisma.member.count({ where: { tenantId: targetTenantId } });
        const memberId = `MEM - ${String(count + 1).padStart(4, '0')} `;

        const member = await prisma.member.create({
            data: {
                memberId,
                name,
                email,
                phone,
                gender: gender || null,
                dob: dob || null,
                source: source || 'Walk-in',
                address: address || null,
                referralCode: referralCode || null,
                idType: idType || null,
                idNumber: idNumber || null,
                emergencyName: emergencyName || null,
                emergencyPhone: emergencyPhone || null,
                fitnessGoal: fitnessGoal || null,
                medicalHistory: healthConditions || null,
                tenantId: targetTenantId,
                status: 'Active',
                joinDate: new Date(),
            }
        });

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

module.exports = {
    searchMembers,
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
};
