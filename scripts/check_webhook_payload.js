const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentWebhook() {
  try {
    const logs = await prisma.webhookLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2
    });
    console.log('Recent Webhook Logs:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentWebhook();
