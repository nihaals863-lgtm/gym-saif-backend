const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const memberId = 3;
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
        console.log('Member 3 not found');
        return;
    }

    const plans = await prisma.workoutPlan.findMany({
        where: { clientId: member.id, status: 'Active' },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Plans for member ${memberId}:`, JSON.stringify(plans, null, 2));
}

check().then(() => process.exit(0));
