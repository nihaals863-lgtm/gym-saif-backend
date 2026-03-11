const prisma = require('../config/prisma');

const scanCheckIn = async (req, res) => {
    try {
        const { qrContent } = req.body;

        if (!qrContent || typeof qrContent !== 'string') {
            return res.status(400).json({ message: 'Invalid QR Code' });
        }

        // qrContent format expected: https://mygymsoftware.com/scan?branchId=1&token=GYM_1_SECURE
        let branchId;
        let token;

        try {
            const url = new URL(qrContent);
            branchId = url.searchParams.get('branchId');
            token = url.searchParams.get('token');
        } catch (e) {
            // Handle raw strings or unexpected formatting safely
            return res.status(400).json({ message: 'Unrecognized QR code format' });
        }

        if (!branchId || !token) {
            return res.status(400).json({ message: 'Missing branch or token in QR Code' });
        }

        const expectedToken = `GYM_${branchId}_SECURE`;
        if (token !== expectedToken) {
            return res.status(400).json({ message: 'Invalid or expired QR Code token' });
        }

        const userId = req.user.id;
        const tenantId = parseInt(branchId, 10);

        // Ensure user belongs to the scanned branch ID, or is a superset role
        if (!['SUPER_ADMIN'].includes(req.user.role) && req.user.tenantId !== tenantId) {
            return res.status(403).json({ message: 'This QR belongs to a different branch than your home branch.' });
        }

        let type = 'Member';
        let memberId = null;

        if (req.user.role === 'MEMBER') {
            const member = await prisma.member.findUnique({ where: { userId } });
            if (!member || member.tenantId !== tenantId) {
                return res.status(403).json({ message: 'You are not registered to this branch.' });
            }
            if (member.status === 'Expired') return res.status(403).json({ message: 'Membership expired. Please renew.' });
            if (member.status !== 'Active') return res.status(403).json({ message: `Membership is currently ${member.status}` });

            type = 'Member';
            memberId = member.id;
        } else if (req.user.role === 'STAFF') {
            type = 'Staff';
        } else if (req.user.role === 'TRAINER') {
            type = 'Trainer';
        } else if (['MANAGER', 'BRANCH_ADMIN'].includes(req.user.role)) {
            type = 'Admin';
        } else {
            return res.status(403).json({ message: 'Your role cannot check-in via QR' });
        }

        // Check for existing check-in today
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const existing = await prisma.attendance.findFirst({
            where: { userId, checkIn: { gte: todayStart, lte: todayEnd } }
        });

        if (existing && !existing.checkOut) {
            // Toggle to Check-out
            const updated = await prisma.attendance.update({
                where: { id: existing.id },
                data: { checkOut: new Date() }
            });
            return res.json({ success: true, message: 'Check-out marked successfully!', attendance: updated });
        } else if (existing && existing.checkOut) {
            return res.status(400).json({ message: 'You have already checked in and out today.' });
        }

        // Process Check-in
        const attendance = await prisma.attendance.create({
            data: {
                memberId,
                userId,
                type,
                checkIn: new Date(),
                tenantId,
                status: 'Present'
            }
        });

        res.json({ success: true, message: 'Check-in marked successfully!', attendance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { scanCheckIn };
