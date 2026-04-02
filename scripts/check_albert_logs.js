const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAccessLogsForAlbert() {
  try {
    const logs = await prisma.accessLog.findMany({
      where: { personName: { contains: 'albert' } },
      orderBy: { scanTime: 'desc' }
    });
    console.log(JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccessLogsForAlbert();
