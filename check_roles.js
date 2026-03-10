require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const users = await prisma.user.findMany({
            take: 5,
            select: { email: true, role: true }
        });
        console.log('--- USER ROLES ---');
        console.table(users);

        const tenants = await prisma.tenant.findMany({
            take: 5,
            select: { id: true, name: true, owner: true }
        });
        console.log('--- TENANT OWNERS ---');
        console.table(tenants);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
