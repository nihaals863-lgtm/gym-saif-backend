const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE user ADD COLUMN department VARCHAR(255), ADD COLUMN baseSalary DECIMAL(10,2), ADD COLUMN accountNumber VARCHAR(255), ADD COLUMN ifsc VARCHAR(255), ADD COLUMN config JSON, ADD COLUMN documents JSON;`);
        console.log('Columns Added');
    } catch (e) {
        console.log(e.message);
    }
}

main().finally(() => prisma.$disconnect());
