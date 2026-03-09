// gym_backend/src/controllers/progress.controller.js
const prisma = require('../config/prisma');

const getProgress = async (req, res) => {
    try {
        const { role, id: userId, email, name: userName, tenantId: userTenantId } = req.user;
        const { memberId: queryMemberId } = req.query;
        let member;

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'TRAINER') {
            const memberId = queryMemberId || (req.body && req.body.memberId);
            if (!memberId) {
                // If no memberId provided but role is member-related, try to find self as fallback
                // though usually admins should provide memberId.
                member = await prisma.member.findUnique({
                    where: { userId: userId }
                });
            } else {
                member = await prisma.member.findUnique({
                    where: { id: parseInt(memberId) }
                });
            }
        } else {
            // Member Role
            member = await prisma.member.findUnique({
                where: { userId: userId }
            });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // Authorization Check
        if (role === 'TRAINER' && member.trainerId !== userId) {
            return res.status(403).json({ message: 'You are not authorized to view progress for this member' });
        }

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            // Verify member belongs to a branch this user manages
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId || -1 },
                        { owner: email || '___NONE___' },
                        { owner: userName || '___NONE___' }
                    ]
                },
                select: { id: true }
            });
            const managedIds = branches.map(b => b.id);
            if (!managedIds.includes(member.tenantId)) {
                return res.status(403).json({ message: 'Member does not belong to your managed branches' });
            }
        }

        const progressLogs = await prisma.memberProgress.findMany({
            where: { memberId: member.id },
            orderBy: { date: 'asc' }
        });

        // Parse JSON strings back to objects
        const parsedLogs = progressLogs.map(log => ({
            ...log,
            measurements: log.measurements ? JSON.parse(log.measurements) : {},
            photos: log.photos ? JSON.parse(log.photos) : []
        }));

        res.json({
            logs: parsedLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberProgressById = async (req, res) => {
    try {
        const { id } = req.params; // Member ID
        const { role, id: userId, email, name: userName, tenantId: userTenantId } = req.user;

        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Authorization Check
        if (role === 'TRAINER' && member.trainerId !== userId) {
            return res.status(403).json({ message: 'You are not assigned to this member' });
        }

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId || -1 },
                        { owner: email || '___NONE___' },
                        { owner: userName || '___NONE___' }
                    ]
                },
                select: { id: true }
            });
            const managedIds = branches.map(b => b.id);
            if (!managedIds.includes(member.tenantId)) {
                return res.status(403).json({ message: 'Member does not belong to your managed branches' });
            }
        }

        const progressLogs = await prisma.memberProgress.findMany({
            where: { memberId: member.id },
            orderBy: { date: 'asc' }
        });

        const parsedLogs = progressLogs.map(log => ({
            ...log,
            measurements: log.measurements ? JSON.parse(log.measurements) : {},
            photos: log.photos ? JSON.parse(log.photos) : []
        }));

        res.json({
            logs: parsedLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logProgress = async (req, res) => {
    try {
        const { weight, bodyFat, measurements, photos, notes, date, memberId: providedMemberId } = req.body;
        const { role, id: userId, email, name: userName, tenantId: userTenantId } = req.user;
        let member;

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'TRAINER') {
            if (!providedMemberId) {
                return res.status(400).json({ message: 'memberId is required for this action' });
            }
            member = await prisma.member.findUnique({
                where: { id: parseInt(providedMemberId) }
            });
        } else {
            // Member Role
            member = await prisma.member.findUnique({
                where: { userId: userId }
            });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // Authorization Check
        if (role === 'TRAINER' && member.trainerId !== userId) {
            return res.status(403).json({ message: 'You are not authorized to log progress for this member' });
        }

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId || -1 },
                        { owner: email || '___NONE___' },
                        { owner: userName || '___NONE___' }
                    ]
                },
                select: { id: true }
            });
            const managedIds = branches.map(b => b.id);
            if (!managedIds.includes(member.tenantId)) {
                return res.status(403).json({ message: 'Member does not belong to your managed branches' });
            }
        }

        const newProgress = await prisma.memberProgress.create({
            data: {
                memberId: member.id,
                weight: weight ? parseFloat(weight) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                measurements: measurements ? JSON.stringify(measurements) : JSON.stringify({}),
                photos: photos ? JSON.stringify(photos) : JSON.stringify([]),
                notes: notes || '',
                date: date ? new Date(date) : new Date()
            }
        });

        res.status(201).json(newProgress);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProgress,
    logProgress,
    getMemberProgressById
};
