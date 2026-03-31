const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all lockers for a tenant
const getAllLockers = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const { branchId: qBranchId, tenantId: qTenantId, search, status } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        // Priority: Query -> Header -> User's default tenant
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

        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { number: { contains: search } },
                { area: { contains: search } },
                { assignedTo: { name: { contains: search } } }
            ];
        }

        const lockers = await prisma.locker.findMany({
            where,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        memberId: true,
                        phone: true,
                        expiryDate: true,
                        status: true
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

// Get Locker Stats
const getLockerStats = async (req, res) => {
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
                // If 'all', stats for all managed branches
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

        const stats = await prisma.locker.groupBy({
            by: ['status'],
            where,
            _count: {
                id: true
            }
        });

        const total = await prisma.locker.count({ where });

        const formattedStats = {
            total,
            available: stats.find(s => s.status === 'Available')?._count.id || 0,
            assigned: stats.find(s => s.status === 'Assigned')?._count.id || 0,
            maintenance: stats.find(s => s.status === 'Maintenance')?._count.id || 0,
            reserved: stats.find(s => s.status === 'Reserved')?._count.id || 0,
            occupancyRate: total > 0 ? Math.round(((stats.find(s => s.status === 'Assigned')?._count.id || 0) / total) * 100) : 0
        };

        res.json(formattedStats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new locker
const addLocker = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const { number, size, area, notes, isChargeable, price, status, tenantId: bodyTenantId } = req.body;

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
                            area,
                            notes,
                            isChargeable: isChargeable || false,
                            price: isChargeable ? parseFloat(price || 0) : 0,
                            status: status || 'Available'
                        }
                    })
                )
            );
            return res.status(201).json({ success: true, message: `Locker created in ${lockers.length} branches`, data: lockers[0] });
        }

        const locker = await prisma.locker.create({
            data: {
                tenantId: (targetTenantId && targetTenantId !== 'all') ? parseInt(targetTenantId) : (userTenantId || 1),
                number,
                size: size || 'Medium',
                area,
                notes,
                isChargeable: isChargeable || false,
                price: isChargeable ? parseFloat(price || 0) : 0,
                status: status || 'Available'
            }
        });

        res.status(201).json({ success: true, data: locker });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Bulk Create Lockers
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
        res.status(500).json({ message: error.message });
    }
};

// Assign locker to member
const assignLocker = async (req, res) => {
    try {
        const { id } = req.params; // locker db id
        const { memberId, isPaid: manualIsPaid } = req.body;
        const { tenantId: userTenantId, role } = req.user;

        // 1. Fetch Locker & Member Details
        const locker = await prisma.locker.findUnique({
            where: { id: parseInt(id) },
            include: { tenant: true }
        });

        if (!locker) return res.status(404).json({ message: 'Locker not found' });
        if (locker.status === 'Assigned') return res.status(400).json({ message: 'Locker already assigned' });

        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) },
            include: { plan: true }
        });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        // 2. Check for Free Locker Benefits
        let isFreeByPlan = false;
        if (member.plan?.benefits) {
            try {
                const benefits = typeof member.plan.benefits === 'string' 
                    ? JSON.parse(member.plan.benefits) 
                    : member.plan.benefits;
                
                // Check if "Locker" is in benefits list
                if (Array.isArray(benefits)) {
                    isFreeByPlan = benefits.some(b => 
                        (typeof b === 'string' && b.toLowerCase().includes('locker')) ||
                        (b.name && b.name.toLowerCase().includes('locker'))
                    );
                }
            } catch (e) {
                console.error("Benefit parse error:", e);
            }
        }

        const isActuallyChargeable = locker.isChargeable && !isFreeByPlan;
        const price = isActuallyChargeable ? parseFloat(locker.price || 0) : 0;

        // 3. Execution using Transaction
        const updatedLocker = await prisma.$transaction(async (tx) => {
            // Create Invoice if it's a paid assignment
            let invoice = null;
            if (isActuallyChargeable && price > 0) {
                invoice = await tx.invoice.create({
                    data: {
                        tenantId: member.tenantId,
                        memberId: member.id,
                        invoiceNumber: `LCK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
                        amount: price,
                        subtotal: price,
                        status: 'Unpaid',
                        dueDate: new Date(),
                        notes: `Locker Assignment: ${locker.number} (${locker.size})`,
                        items: {
                            create: [{
                                description: `Locker Assignment Fee - #${locker.number}`,
                                quantity: 1,
                                rate: price,
                                amount: price
                            }]
                        }
                    }
                });
            }

            // Update Locker
            return await tx.locker.update({
                where: { id: parseInt(id) },
                data: {
                    status: 'Assigned',
                    assignedToId: member.id,
                    isPaid: !isActuallyChargeable || (manualIsPaid ?? false),
                    notes: `Assigned to ${member.name} on ${new Date().toLocaleDateString()}${isFreeByPlan ? ' (Member Benefit)' : ''}`
                },
                include: { assignedTo: true }
            });
        });

        res.json({
            message: isFreeByPlan ? "Locker assigned as member benefit" : (isActuallyChargeable ? "Paid locker assigned, invoice generated" : "Locker assigned"),
            data: updatedLocker
        });
    } catch (error) {
        console.error("Locker assignment error:", error);
        res.status(500).json({ message: error.message });
    }
};

// Release locker
const releaseLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const locker = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Available',
                assignedToId: null,
                isPaid: false
            }
        });

        res.json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Maintenance mode
const toggleMaintenance = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'Maintenance' or 'Available'

        const locker = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: status === 'Maintenance' ? 'Maintenance' : 'Available'
            }
        });

        res.json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete locker
const deleteLocker = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.locker.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Locker deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllLockers,
    getLockerStats,
    addLocker,
    bulkCreateLockers,
    assignLocker,
    releaseLocker,
    toggleMaintenance,
    deleteLocker
};
