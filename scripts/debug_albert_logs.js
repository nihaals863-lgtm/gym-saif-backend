const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const records = await p.accessLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Recent 5 logs:', JSON.stringify(records, null, 2));

  const member = await p.member.findFirst({
    where: { OR: [{ name: { contains: 'albert' } }, { memberId: { contains: 'MEM17751309405531' } }] }
  });
  console.log('Albert info:', JSON.stringify(member, null, 2));
}

check().catch(console.error).finally(() => p.$disconnect());
