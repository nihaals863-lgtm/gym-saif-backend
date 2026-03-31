const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const member = await prisma.member.findFirst({
    where: { memberId: 'MEM-1774966712174-1' },
    include: { invoices: true, storeOrders: true }
  });
  console.log(JSON.stringify(member, null, 2));
  process.exit(0);
}
check();
