const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkIds() {
    const users = await prisma.user.findMany({
        where: { email: 'trainer@gym.com' }
    });
    console.log('Users:', JSON.stringify(users, null, 2));

    const members = await prisma.member.findMany({
        where: { id: 3 }
    });
    console.log('Members:', JSON.stringify(members, null, 2));
}

checkIds();
