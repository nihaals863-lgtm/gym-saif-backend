const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.user.count({
        where: {
            role: { in: ['STAFF', 'TRAINER', 'MANAGER'] },
            tenantId: 1
        }
    });
    console.log('Count:', count);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
