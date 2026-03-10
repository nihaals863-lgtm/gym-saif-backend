require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
    try {
        const tenants = await prisma.tenant.findMany();
        console.log('--- TENANTS ---');
        console.table(tenants.map(t => ({ id: t.id, name: t.name, owner: t.owner })));

        const users = await prisma.user.findMany({
            where: { role: 'BRANCH_ADMIN' }
        });
        console.log('--- BRANCH ADMINS ---');
        console.table(users.map(u => ({ id: u.id, name: u.name, email: u.email, tenantId: u.tenantId })));

        const invoices = await prisma.invoice.findMany({
            where: { id: 14 },
            include: { tenant: true }
        });
        console.log('--- INVOICE #14 ---');
        console.table(invoices.map(i => ({ id: i.id, tenantId: i.tenantId, tenantName: i.tenant?.name, tenantOwner: i.tenant?.owner })));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspect();
