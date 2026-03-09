const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE member DROP INDEX member_memberId_key;`);
        console.log('Index 2 dropped');
    } catch (e) {
        console.log(e.message);
    }
}

main().finally(() => prisma.$disconnect());
