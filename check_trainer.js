const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const trainer = await prisma.user.findFirst({
        where: { role: 'TRAINER' }
    });
    console.log("Trainer Profile:", JSON.stringify(trainer, null, 2));
}

main().finally(() => prisma.$disconnect());
