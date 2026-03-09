const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllAnnouncements = async (req, res) => {
    try {
        const { role } = req.user;
        let tenantId = req.user.tenantId;

        if (role === 'MEMBER') {
            const member = await prisma.member.findFirst({
                where: { userId: parseInt(req.user.id) }
            });
            if (member) {
                tenantId = member.tenantId;
            }
        }

        const { portal } = req.query;
        const where = {};

        if (portal === 'member') {
            where.OR = [
                { targetRole: { mode: 'insensitive', equals: 'all' } },
                { targetRole: { mode: 'insensitive', equals: 'MEMBER' } },
                { targetRole: { mode: 'insensitive', equals: 'member' } },
                { targetRole: { mode: 'insensitive', equals: 'ACTIVE' } }
            ];

            if (role !== 'SUPER_ADMIN') {
                const tenantFilter = [null];
                const tid = parseInt(tenantId);
                if (!isNaN(tid)) {
                    tenantFilter.push(tid);
                }
                where.tenantId = { in: tenantFilter };
            }
        } else {
            if (role !== 'SUPER_ADMIN') {
                const tid = parseInt(tenantId);
                if (!isNaN(tid)) {
                    where.tenantId = tid;
                }
            }
        }

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        // Format for frontend
        const formatted = announcements.map(a => ({
            id: a.id,
            title: a.title,
            message: a.content,
            content: a.content,
            date: new Date(a.createdAt).toLocaleDateString(),
            createdAt: a.createdAt,
            priority: a.priority,
            targetRole: a.targetRole
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addAnnouncement = async (req, res) => {
    try {
        const { tenantId, role, id } = req.user;
        const { title, message, content, priority, targetAudience, targetRole } = req.body;

        const newAnnouncement = await prisma.announcement.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : parseInt(tenantId),
                title,
                content: message || content,
                priority: priority ? String(priority) : 'medium',
                targetRole: targetRole || (targetAudience ? targetAudience.toLowerCase() : 'all'),
                authorId: id
            }
        });

        // --- NOTIFICATION ---
        // Determine who to notify
        const tId = role === 'SUPER_ADMIN' ? null : parseInt(tenantId);
        const tRole = (targetRole || targetAudience || 'all').toUpperCase();

        let userWhere = {};
        if (tId) userWhere.tenantId = tId;
        if (tRole !== 'ALL' && tRole !== 'ACTIVE') {
            userWhere.role = tRole;
        }

        const usersToNotify = await prisma.user.findMany({
            where: userWhere,
            select: { id: true }
        });

        if (usersToNotify.length > 0) {
            await prisma.notification.createMany({
                data: usersToNotify.map(u => ({
                    userId: u.id,
                    title: `Announcement: ${title}`,
                    message: (message || content || '').substring(0, 100),
                    type: priority === 'high' ? 'warning' : 'info',
                    link: '/dashboard'
                }))
            });
        }

        res.status(201).json(newAnnouncement);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
