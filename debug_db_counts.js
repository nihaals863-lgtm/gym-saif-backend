const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const roles = await prisma.user.groupBy({
            by: ['role', 'tenantId'],
            _count: true
        });
        console.log('--- USER COUNTS PER ROLE/TENANT ---');
        console.log(roles);

        const tasks = await prisma.task.groupBy({
            by: ['tenantId'],
            _count: true
        });
        console.log('\n--- TASK COUNTS PER TENANT ---');
        console.log(tasks);

        const users = await prisma.user.findMany({
            where: { role: 'STAFF' },
            select: { id: true, name: true, tenantId: true }
        });
        console.log('\n--- ALL STAFF USERS ---');
        console.log(users);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
