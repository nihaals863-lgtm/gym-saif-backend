const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Tenants ---');
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, owner: true }
        });
        console.table(tenants);

        console.log('\n--- Admin Users ---');
        const admins = await prisma.user.findMany({
            where: { role: 'BRANCH_ADMIN' },
            select: { id: true, email: true, name: true, tenantId: true }
        });
        console.table(admins);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
