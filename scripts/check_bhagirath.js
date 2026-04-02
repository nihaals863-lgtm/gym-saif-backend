const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBhagirath() {
  try {
    const member = await prisma.member.findFirst({
      where: { OR: [
        { name: { contains: 'Bhagirath' } },
        { memberId: 'MAIN00003' },
        { memberId: 'MAIN-00003' }
      ]}
    });
    console.log('Member found:', JSON.stringify(member, null, 2));

    const logs = await prisma.accessLog.findMany({
      where: { personName: { contains: 'Bhagirath' } }
    });
    console.log('Logs found:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkBhagirath();
