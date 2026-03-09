const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function watchPlans() {
    const plans = await prisma.workoutPlan.findMany({
        where: { clientId: 3 },
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(plans, null, 2));
}

watchPlans();
