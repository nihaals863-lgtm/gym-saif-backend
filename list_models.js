const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('Available models in Prisma:');
Object.keys(prisma).forEach(key => {
    if (prisma[key] && typeof prisma[key] === 'object' && prisma[key].deleteMany) {
        console.log(`- ${key}`);
    }
});

process.exit(0);
