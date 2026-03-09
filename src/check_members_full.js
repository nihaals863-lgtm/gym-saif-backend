const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const members = await prisma.member.findMany({
        include: { tenant: true }
    });
    console.log('Members with Tenant Info:', JSON.stringify(members, null, 2));
    process.exit(0);
}
main();
