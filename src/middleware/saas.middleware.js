const prisma = require('../config/prisma');

const checkSaaSLimit = (resourceType) => {
    return async (req, res, next) => {
        try {
            const { tenantId, role } = req.user;

            // Super admin bypass
            if (role === 'SUPER_ADMIN') {
                return next();
            }

            if (!tenantId) {
                return res.status(403).json({
                    message: `Access Blocked: Your account (${role}) is not associated with any Gym/Tenant. Cannot verify SaaS limits.`,
                    code: 'MISSING_TENANT_ID'
                });
            }

            // 1. Get Active Subscription
            const subscription = await prisma.subscription.findFirst({
                where: {
                    tenantId,
                    status: 'Active'
                }
            });

            if (!subscription) {
                console.warn(`[SaaS Check Bypass] No active subscription for Tenant ID ${tenantId}. Allowing access.`)
                return next();
            }

            // 2. Get Plan Limits
            const plan = await prisma.saaSPlan.findUnique({
                where: { id: subscription.planId }
            });

            if (!plan) {
                return res.status(404).json({ message: 'Associated SaaS plan not found.' });
            }

            const limits = plan.limits || {};
            const resourceLimit = limits[resourceType];

            // If no limit defined for this type, default to block for safety or allow? 
            // Better to allow if not explicitly limited in this logic, depends on design.
            // Let's assume if it's not in limits, we don't enforce it here.
            if (!resourceLimit) return next();

            if (resourceLimit.isUnlimited) return next();

            const limitValue = parseInt(resourceLimit.value);

            // 3. Check Current Usage
            let currentUsage = 0;
            if (resourceType === 'members') {
                currentUsage = await prisma.member.count({ where: { tenantId } });
            } else if (resourceType === 'staff') {
                currentUsage = await prisma.user.count({
                    where: {
                        tenantId,
                        role: { in: ['STAFF', 'TRAINER', 'MANAGER'] }
                    }
                });
            } else if (resourceType === 'branches') {
                // To count branches for a Branch Admin, we look for all Tenants owned by this user
                // The owner is identified by the subscriber field in their subscription
                const ownerEmail = subscription.subscriber;
                currentUsage = await prisma.tenant.count({
                    where: {
                        owner: { contains: ownerEmail }
                    }
                });
            }

            if (currentUsage >= limitValue) {
                return res.status(403).json({
                    message: `Limit reached. Your ${plan.name} allows up to ${limitValue} ${resourceType}. Please upgrade your plan.`,
                    limitReached: true,
                    resource: resourceType,
                    currentUsage,
                    limit: limitValue
                });
            }

            next();
        } catch (error) {
            console.error('SaaS Limit Check Error:', error);
            res.status(500).json({ message: 'Internal server error during limit verification.' });
        }
    };
};

module.exports = { checkSaaSLimit };
