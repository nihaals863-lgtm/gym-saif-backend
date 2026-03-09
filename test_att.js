const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    console.log(await prisma.attendance.findMany({
        take: 5,
        include: { user: { select: { name: true, role: true } } }
    }));
}
main().finally(() => prisma.$disconnect());
