const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllFeedback = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId } = req.query;
        const where = {};

        if (branchId && branchId !== 'all') {
            where.tenantId = parseInt(branchId);
        } else if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        if (role === 'MEMBER') {
            const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            if (memberRaw && memberRaw.length > 0) {
                where.memberId = memberRaw[0].id;
            }
        }

        const feedbacks = await prisma.feedback.findMany({
            where,
            orderBy: { date: 'desc' }
        });

        const memberIds = feedbacks.map(f => f.memberId).filter(Boolean);
        let membersMap = {};
        if (memberIds.length > 0) {
            const members = await prisma.member.findMany({
                where: { id: { in: memberIds } },
                select: { id: true, name: true }
            });
            members.forEach(m => {
                membersMap[m.id] = m.name;
            });
        }

        const formatted = feedbacks.map(f => ({
            id: f.id,
            memberId: f.memberId,
            member: membersMap[f.memberId] || 'Anonymous',
            rating: f.rating,
            comment: f.comment,
            status: f.status,
            isPublishedToGoogle: f.isPublishedToGoogle,
            date: new Date(f.date).toLocaleDateString()
        }));

        // Get tenant settings to check for Google review link
        const settings = await prisma.tenantSettings.findUnique({
            where: { tenantId: role === 'SUPER_ADMIN' ? 1 : tenantId }
        });

        res.json({
            feedback: formatted,
            googleReviewLink: settings?.googleReviewLink || null,
            googleBusinessEnabled: settings?.googleBusinessEnabled || false
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addFeedback = async (req, res) => {
    try {
        let tenantId = req.user.tenantId;
        const role = req.user.role;
        const { rating, comment } = req.body;
        let finalMemberId = null;

        if (role === 'MEMBER') {
            const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            const member = memberRaw[0];
            if (!member) return res.status(404).json({ message: 'Member profile not found' });

            finalMemberId = member.id;
            tenantId = member.tenantId;
        } else {
            finalMemberId = parseInt(req.body.memberId) || 1;
        }

        const newFeedback = await prisma.feedback.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                memberId: finalMemberId,
                rating: parseInt(rating) || 5,
                comment,
                status: 'Pending'
            }
        });

        res.status(201).json(newFeedback);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const updated = await prisma.feedback.updateMany({
            where,
            data: { status }
        });

        res.json({ message: 'Feedback status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.publishToGoogle = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        await prisma.feedback.updateMany({
            where,
            data: { isPublishedToGoogle: true, status: 'Resolved' }
        });

        res.json({ message: 'Feedback marked as published to Google' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
