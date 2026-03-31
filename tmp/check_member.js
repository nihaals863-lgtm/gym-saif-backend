const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const member = await prisma.member.findUnique({
    where: { memberId: 'MEM-1774956469496-1' },
    include: { plan: true, invoices: true }
  });
  console.log(JSON.stringify(member, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
