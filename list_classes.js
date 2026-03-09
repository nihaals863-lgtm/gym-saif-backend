const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const classes = await prisma.class.findMany();
        console.log('--- Classes in DB ---');
        console.log(JSON.stringify(classes, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
