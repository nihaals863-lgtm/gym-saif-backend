// gym_backend/src/middleware/auth.middleware.j
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies.token) {
            token = req.cookies.token; // Fallback for existing web sessions
        }

        if (!token) {
            return res.status(401).json({ message: 'Not authorized, no token' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: { tenant: true }
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // --- Fetch owned tenants for BRANCH_ADMIN to ensure data isolation ---
        if (user.role === 'BRANCH_ADMIN') {
            const ownedTenants = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: user.tenantId || undefined },
                        { owner: user.email || undefined },
                        { owner: user.name || undefined }
                    ].filter(cond => Object.values(cond)[0] !== undefined)
                },
                select: { id: true }
            });
            user.ownedTenantIds = ownedTenants.map(t => t.id);
        } else {
            // For other roles, they only have access to their own tenant
            user.ownedTenantIds = user.tenantId ? [user.tenantId] : [];
        }

        req.user = user;
        console.log(`[Auth] User ${user.email} (${user.role}) authenticated. Owned Branches: ${user.ownedTenantIds.join(', ')}`);
        next();
    } catch (error) {
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;
        const isAuthorized = roles.some(role =>
            role.toUpperCase().trim() === userRole?.toUpperCase().trim()
        );

        if (!isAuthorized) {
            const msg = `Access Denied: Your role (${userRole}) does not have permission for this action. Required: [${roles.join(', ')}]`;
            console.warn(`[AUTH] ${msg} | User: ${req.user?.id}`);
            return res.status(403).json({
                message: msg,
                code: 'UNAUTHORIZED_ROLE'
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
