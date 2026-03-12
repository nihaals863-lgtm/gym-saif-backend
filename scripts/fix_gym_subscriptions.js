const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixGymSubscriptions() {
    try {
        console.log('--- Fixing Gym Subscriptions ---');
        
        // 1. Get first active SaaS Plan
        const plan = await prisma.saaSPlan.findFirst({
            where: { status: 'Active' }
        });
        
        if (!plan) {
            console.error('No active SaaS Plan found. Please create one first.');
            return;
        }
        
        console.log(`Using Plan: ${plan.name} (ID: ${plan.id})`);
        
        // 2. Find all Tenants without subscriptions
        const tenants = await prisma.tenant.findMany({
            include: { subscriptions: true }
        });
        
        const tenantsWithoutSubs = tenants.filter(t => t.subscriptions.length === 0);
        console.log(`Found ${tenantsWithoutSubs.length} tenants without subscriptions.`);
        
        for (const tenant of tenantsWithoutSubs) {
            console.log(`Creating subscription for ${tenant.name}...`);
            
            const startDate = new Date();
            const endDate = new Date();
            if (plan.period === 'Monthly') {
                endDate.setMonth(endDate.getMonth() + 1);
            } else {
                endDate.setFullYear(endDate.getFullYear() + 1);
            }
            
            await prisma.subscription.create({
                data: {
                    tenantId: tenant.id,
                    planId: plan.id,
                    subscriber: tenant.owner || 'Admin',
                    startDate,
                    endDate,
                    status: 'Active',
                    paymentStatus: 'Paid'
                }
            });
            
            console.log(`Done for ${tenant.name}`);
        }
        
        console.log('--- All Subscriptions Fixed ---');
    } catch (error) {
        console.error('Error fixing subscriptions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixGymSubscriptions();
