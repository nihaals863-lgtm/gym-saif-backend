const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAccessLogs() {
  try {
    const logs = await prisma.accessLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('Recent 5 Access Logs:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccessLogs();
