const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.attendance.count();
    console.log('Total attendance records:', count);

    const sample = await prisma.attendance.findMany({
        take: 5,
        orderBy: { checkIn: 'desc' },
        include: {
            member: { select: { name: true } },
            user: { select: { name: true } }
        }
    });
    console.log('Sample records:', JSON.stringify(sample, null, 2));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayCount = await prisma.attendance.count({
        where: {
            checkIn: {
                gte: today,
                lt: tomorrow
            }
        }
    });
    console.log('Attendance records starting today:', todayCount);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
