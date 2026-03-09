const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, owner: true }
        });
        console.log('--- TENANTS ---');
        console.log(JSON.stringify(tenants, null, 2));

        const users = await prisma.user.findMany({
            where: { role: 'BRANCH_ADMIN' },
            select: { id: true, name: true, email: true, role: true, tenantId: true }
        });
        console.log('--- BRANCH ADMINS ---');
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
