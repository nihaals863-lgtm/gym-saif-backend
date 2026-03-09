// gym_backend/src/routes/branches.routes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const prisma = require('../config/prisma');

router.use(protect);

router.get('/', async (req, res) => {
    try {
        const { role, tenantId, email, name } = req.user;
        let where = {};

        if (role === 'SUPER_ADMIN') {
            // Can see all branches
        } else if (role === 'BRANCH_ADMIN') {
            // Find all branches owned by this user (by owner string matching name/email, OR fallback to their own tenant)
            where = {
                OR: [
                    { id: tenantId },
                    { owner: email },
                    { owner: name }
                ]
            };
        } else {
            // Others only see their own branch
            where = { id: tenantId };
        }

        const branches = await prisma.tenant.findMany({
            where,
            select: { id: true, name: true, branchName: true, status: true, owner: true }
        });

        // Ensure name is present for the frontend
        const formatted = branches.map(b => ({
            ...b,
            name: b.branchName || b.name
        }));

        res.json({ data: formatted });
    } catch (error) {
        console.error('Fetch branches error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
