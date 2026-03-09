const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const email = 'trainer@gym.com';
    const password = 'trainer123';

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log(`User ${email} not found`);
    } else {
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`User found. Password match for '${password}': ${isMatch}`);
        console.log(`Role: ${user.role}`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
