const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findUrlNames() {
  try {
    const users = await prisma.user.findMany({
      where: { OR: [
        { name: { contains: 'n1txem18un5yzsuhnoqb' } },
        { email: { contains: 'n1txem18un5yzsuhnoqb' } },
        { phone: { contains: 'n1txem18un5yzsuhnoqb' } }
      ] }
    });
    const members = await prisma.member.findMany({
      where: { OR: [
        { name: { contains: 'n1txem18un5yzsuhnoqb' } },
        { memberId: { contains: 'n1txem18un5yzsuhnoqb' } },
        { phone: { contains: 'n1txem18un5yzsuhnoqb' } }
      ] }
    });
    console.log('Users with URL in name:', JSON.stringify(users, null, 2));
    console.log('Members with URL in name:', JSON.stringify(members, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

findUrlNames();
