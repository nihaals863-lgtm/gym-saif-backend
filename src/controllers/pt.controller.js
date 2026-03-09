const prisma = require('../config/prisma');

// --- PT PACKAGES ---

const createPackage = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId, name, sessionType, totalSessions, price, gstPercent, gstInclusive, validityDays, description } = req.body;

        if ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') && branchId === 'all') {
            let branches = [];
            if (role === 'SUPER_ADMIN') {
                branches = await prisma.tenant.findMany({ where: { status: 'Active' } });
            } else {
                branches = [{ id: tenantId }];
            }

            if (branches.length > 1) {
                const packagesToCreate = branches.map(branch => ({
                    tenantId: branch.id,
                    name,
                    sessionType: sessionType || "Fixed Sessions",
                    totalSessions: parseInt(totalSessions),
                    price: parseFloat(price),
                    gstPercent: parseFloat(gstPercent || 18),
                    gstInclusive: !!gstInclusive,
                    validityDays: parseInt(validityDays || 90),
                    description
                }));
                await prisma.pTPackage.createMany({ data: packagesToCreate });
                return res.status(201).json({ message: 'Packages created for all branches' });
            }
        }

        const targetTenantId = ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') && branchId && branchId !== 'all') ? parseInt(branchId) : tenantId;

        const newPackage = await prisma.pTPackage.create({
            data: {
                tenantId: targetTenantId,
                name,
                sessionType: sessionType || "Fixed Sessions",
                totalSessions: parseInt(totalSessions),
                price: parseFloat(price),
                gstPercent: parseFloat(gstPercent || 18),
                gstInclusive: !!gstInclusive,
                validityDays: parseInt(validityDays || 90),
                description
            }
        });
        res.status(201).json(newPackage);
    } catch (error) {
        console.error('Create PT Package Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getPackages = async (req, res) => {
    try {
        const { tenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                // Fetch all branches the user has access to
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: tenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const packages = await prisma.pTPackage.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(packages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Remove branchId from update data if present
        delete data.branchId;

        const updated = await prisma.pTPackage.update({
            where: { id: parseInt(id) },
            data: {
                ...data,
                totalSessions: data.totalSessions ? parseInt(data.totalSessions) : undefined,
                price: data.price ? parseFloat(data.price) : undefined,
                gstPercent: data.gstPercent ? parseFloat(data.gstPercent) : undefined,
                validityDays: data.validityDays ? parseInt(data.validityDays) : undefined,
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deletePackage = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.pTPackage.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Package deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- MEMBER PT ACCOUNTS ---

const purchasePackage = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { memberId, packageId } = req.body;

        const pkg = await prisma.pTPackage.findUnique({ where: { id: parseInt(packageId) } });
        if (!pkg) return res.status(404).json({ message: 'Package not found' });

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + pkg.validityDays);

        const account = await prisma.pTMemberAccount.create({
            data: {
                tenantId: pkg.tenantId, // Use the package's tenant
                memberId: parseInt(memberId),
                packageId: parseInt(packageId),
                totalSessions: pkg.totalSessions,
                remainingSessions: pkg.totalSessions,
                expiryDate,
                status: 'Active'
            }
        });

        res.status(201).json(account);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getActiveAccounts = async (req, res) => {
    try {
        const { tenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;

        let where = { status: 'Active' };
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: tenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const accounts = await prisma.pTMemberAccount.findMany({
            where,
            include: {
                member: { select: { id: true, name: true, memberId: true } },
                package: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- SESSIONS ---

const logSession = async (req, res) => {
    try {
        const { tenantId: userTenantId } = req.user;
        const { memberId, trainerId, ptAccountId, date, time, duration, notes } = req.body;

        // Try to get tenantId from account first to ensure consistency
        let effectiveTenantId = userTenantId;
        if (ptAccountId) {
            const account = await prisma.pTMemberAccount.findUnique({
                where: { id: parseInt(ptAccountId) },
                select: { tenantId: true, remainingSessions: true }
            });
            if (account) {
                effectiveTenantId = account.tenantId;
            }
        }

        const session = await prisma.pTSession.create({
            data: {
                tenantId: effectiveTenantId || 1,
                memberId: parseInt(memberId),
                trainerId: parseInt(trainerId),
                ptAccountId: ptAccountId ? parseInt(ptAccountId) : null,
                date: new Date(date),
                time,
                duration: parseInt(duration || 60),
                notes,
                status: 'Completed'
            }
        });

        // If linked to an account, decrement sessions
        if (ptAccountId) {
            const account = await prisma.pTMemberAccount.findUnique({ where: { id: parseInt(ptAccountId) } });
            if (account && account.remainingSessions > 0) {
                await prisma.pTMemberAccount.update({
                    where: { id: account.id },
                    data: {
                        remainingSessions: account.remainingSessions - 1,
                        status: account.remainingSessions - 1 === 0 ? 'Completed' : 'Active'
                    }
                });
            }
        }

        res.status(201).json(session);
    } catch (error) {
        console.error('Log Session Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getSessions = async (req, res) => {
    try {
        const { tenantId, role, email, name: userName } = req.user;
        const { branchId, trainerId, memberId } = req.query;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: tenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (trainerId) where.trainerId = parseInt(trainerId);
        if (memberId) where.memberId = parseInt(memberId);

        const sessions = await prisma.pTSession.findMany({
            where,
            include: {
                member: { select: { id: true, name: true } },
                trainer: { select: { id: true, name: true } },
                ptAccount: {
                    include: { package: { select: { name: true } } }
                }
            },
            orderBy: { date: 'desc' }
        });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPTStats = async (req, res) => {
    try {
        const { tenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: tenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const [totalPackages, activeAccounts, sessionsToday] = await Promise.all([
            prisma.pTPackage.count({ where }),
            prisma.pTMemberAccount.count({ where: { ...where, status: 'Active' } }),
            prisma.pTSession.count({
                where: {
                    ...where,
                    date: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lte: new Date(new Date().setHours(23, 59, 59, 999))
                    }
                }
            })
        ]);

        const completionSessions = await prisma.pTSession.count({
            where: { ...where, status: 'Completed' }
        });
        const totalSessions = await prisma.pTSession.count({ where });
        const completionRate = totalSessions > 0 ? Math.round((completionSessions / totalSessions) * 100) : 0;

        res.json({
            totalPackages,
            activeAccounts,
            sessionsToday,
            completionRate
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createPackage,
    getPackages,
    updatePackage,
    deletePackage,
    purchasePackage,
    getActiveAccounts,
    logSession,
    getSessions,
    getPTStats
};
