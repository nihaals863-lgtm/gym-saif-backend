const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Listing all users in the database:");
    const users = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            role: true,
            name: true
        }
    });
    console.table(users);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
