const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    console.log('Tenants:', JSON.stringify(tenants, null, 2));
    process.exit(0);
}
main();
