const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const members = await prisma.member.findMany({
        include: {
            user: { select: { email: true, role: true, tenantId: true } },
            tenant: { select: { name: true } }
        }
    });
    console.log('Members cross-check:', JSON.stringify(members, null, 2));
    process.exit(0);
}
main();
