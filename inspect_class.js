const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const classes = await prisma.class.findMany({ take: 1 });
        console.log('Class data sample:', JSON.stringify(classes[0], null, 2));
    } catch (e) {
        console.error('Error fetching class data:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
