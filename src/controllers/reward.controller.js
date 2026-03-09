const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllRewards = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const rewards = await prisma.reward.findMany({
            where,
            orderBy: { date: 'desc' },
            include: {
                member: true
            }
        });

        const formatted = rewards.map(r => ({
            id: r.id,
            name: r.name,
            member: r.member ? r.member.name : 'Unknown Member',
            points: r.points,
            description: r.description,
            date: new Date(r.date).toLocaleDateString()
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addReward = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { name, points, description } = req.body;

        const newReward = await prisma.reward.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                name,
                points: parseInt(points) || 0,
                description
            }
        });

        res.status(201).json(newReward);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
