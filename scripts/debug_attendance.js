const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAttendance() {
  try {
    const attendance = await prisma.attendance.findMany({
      take: 5,
      orderBy: { checkIn: 'desc' },
      include: {
        member: true,
        user: true
      }
    });
    console.log(JSON.stringify(attendance, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkAttendance();
