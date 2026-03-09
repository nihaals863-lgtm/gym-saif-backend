const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWorkoutPlans() {
    try {
        const plans = await prisma.workoutPlan.findMany({
            orderBy: { createdAt: 'desc' }
        });
        console.log(JSON.stringify(plans, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkWorkoutPlans();
