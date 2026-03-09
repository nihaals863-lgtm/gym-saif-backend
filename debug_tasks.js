const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const tasks = await prisma.task.findMany({
            take: 20,
            orderBy: { id: 'desc' }
        });
        console.log('--- LATEST TASKS ---');
        console.log(JSON.stringify(tasks, null, 2));

        const users = await prisma.user.findMany({
            where: { role: 'STAFF' },
            take: 10
        });
        console.log('\n--- STAFF USERS ---');
        console.log(JSON.stringify(users, null, 2));

        const branches = await prisma.tenant.findMany({
            take: 5
        });
        console.log('\n--- BRANCHES (TENANTS) ---');
        console.log(JSON.stringify(branches, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
