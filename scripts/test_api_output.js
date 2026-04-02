const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testApiOutput() {
  try {
    const attendance = await prisma.attendance.findMany({
      include: {
        user: { select: { name: true, role: true, avatar: true } },
        member: {
          select: {
            name: true,
            memberId: true,
            avatar: true,
            plan: { select: { name: true } }
          }
        }
      },
      orderBy: { checkIn: 'desc' },
      take: 5
    });

    const formatted = attendance.map(a => {
      const isMember = a.type?.toLowerCase() === 'member';
      return {
        id: a.id,
        name: a.member?.name || a.user?.name || 'N/A',
        type: isMember ? 'Member' : 'Staff',
        originalType: a.type
      };
    });

    console.log(JSON.stringify(formatted, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

testApiOutput();
