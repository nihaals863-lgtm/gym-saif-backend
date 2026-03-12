const { Prisma } = require('@prisma/client');

console.log('Tenant include possibilities:');
// This is accessible via Prisma.TenantSelect or similar if we look at the generated types,
// but let's try to just inspect the Prisma Client object if it was successfully imported.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('Keys in prisma.tenant findMany include:');
// We can't easily see valid include keys at runtime easily without dmmf,
// but we can try a dummy query and catch the error to see what it suggests.
async function test() {
    try {
        await prisma.tenant.findMany({
            include: {
                invalid_field_to_trigger_error: true
            }
        });
    } catch (e) {
        console.log(e.message);
    }
}

test();
