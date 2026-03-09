const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const plans = await prisma.workoutPlan.findMany({
            where: { name: 'fgh' }
        });
        console.log('--- All plans named "fgh" ---');
        console.log(JSON.stringify(plans, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
