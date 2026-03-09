const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        where: {
            role: { in: ['STAFF', 'TRAINER', 'MANAGER', 'BRANCH_ADMIN'] }
        },
        select: {
            id: true,
            name: true,
            email: true,
            baseSalary: true,
            config: true
        }
    });
    console.log(JSON.stringify(users, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
