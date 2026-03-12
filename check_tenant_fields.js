const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fields available in Tenant model:');
    // This is a hacky way to check, better to look at the generated types if possible, 
    // but we can try to find them in the dmmf if available or just test it.
    console.log(Object.keys(prisma.tenant));
}

main();
