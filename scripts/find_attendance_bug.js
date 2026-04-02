const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findInAttendance() {
  try {
    const attendance = await prisma.attendance.findMany({
      include: { member: true, user: true }
    });
    
    for (const a of attendance) {
      const str = JSON.stringify(a);
      if (str.includes('n1txem18un5yzsuhnoqb')) {
        console.log('Record including the string:', JSON.stringify(a, null, 2));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

findInAttendance();
