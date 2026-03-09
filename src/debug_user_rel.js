const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const members = await prisma.member.findMany({
            include: { user: true }
        });
        console.log('Members with User:', JSON.stringify(members, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
main();
