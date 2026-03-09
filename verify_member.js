const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const member = await prisma.member.findFirst({
            where: { memberId: 'MEM-001' }
        });
        console.log('--- Member MEM-001 ---');
        console.log(JSON.stringify(member, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
