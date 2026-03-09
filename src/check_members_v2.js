const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const members = await prisma.member.findMany({
        select: {
            id: true,
            memberId: true,
            name: true,
            tenantId: true,
            userId: true
        }
    });
    console.log('Members:', members);
    process.exit(0);
}
main();
