const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentMipsLogs() {
  try {
    const logs = await prisma.webhookLog.findMany({
      where: {
        OR: [
          { endpoint: { contains: 'gym-device/webhook' } },
          { endpoint: { contains: 'mips' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 1
    });
    console.log('Most Recent MIPS Log:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentMipsLogs();
