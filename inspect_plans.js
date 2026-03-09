const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const workoutPlans = await prisma.workoutPlan.findMany();
        console.log('--- Workout Plans ---');
        console.log(JSON.stringify(workoutPlans, null, 2));

        const dietPlans = await prisma.dietPlan.findMany();
        console.log('--- Diet Plans ---');
        console.log(JSON.stringify(dietPlans, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
