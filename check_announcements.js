const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const announcements = await prisma.announcement.findMany();
        console.log('--- Announcements ---');
        console.log(JSON.stringify(announcements, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
