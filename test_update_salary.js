const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.user.update({
        where: { id: 38 },
        data: { baseSalary: 25000.00 }
    });
    console.log('Update success');
}

main().finally(() => prisma.$disconnect());
