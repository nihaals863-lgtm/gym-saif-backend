const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const plan = await prisma.workoutPlan.findFirst({
            where: { name: 'fgh' }
        });
        if (plan) {
            console.log('--- Plan "fgh" ---');
            console.log(JSON.stringify(plan, null, 2));
        } else {
            console.log('Plan "fgh" not found');
            const all = await prisma.workoutPlan.findMany({ select: { id: true, name: true, goal: true } });
            console.log('All Plans:', all);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
