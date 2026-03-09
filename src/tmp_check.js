const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const users = await prisma.user.findMany({
        select: { id: true, name: true, role: true, tenantId: true }
    });
    console.log('Users:', JSON.stringify(users, null, 2));

    const attendance = await prisma.attendance.findMany({
        take: 10,
        orderBy: { id: 'desc' }
    });
    console.log('Recent Attendance:', JSON.stringify(attendance, null, 2));
}

check().catch(e => console.error(e)).finally(() => prisma.$disconnect());
