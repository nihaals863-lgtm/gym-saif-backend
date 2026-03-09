const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const members = await prisma.member.findMany({
            select: { id: true, name: true, userId: true }
        });
        console.log('--- Members ---');
        console.log(members);

        const currentUserId = 1; // Arbitrary, but usually 1 is the first user
        const member = await prisma.member.findUnique({ where: { userId: currentUserId } });
        console.log('Member for userId 1:', member);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
