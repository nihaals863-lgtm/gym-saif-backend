const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDiet() {
    const plans = await prisma.dietPlan.findMany({
        where: { clientId: 3 },
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(plans, null, 2));
}

checkDiet();
