const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const where = {
        role: { in: ['STAFF', 'TRAINER', 'MANAGER'] },
        tenantId: { in: [1] }
    };

    console.log('Testing where clause:', JSON.stringify(where, null, 2));

    const staff = await prisma.user.findMany({ where });
    console.log('Result length:', staff.length);
    console.log('Result:', JSON.stringify(staff, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
