const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, owner: true } });
    console.log('Tenants with Owner:', tenants);
    process.exit(0);
}
main();
