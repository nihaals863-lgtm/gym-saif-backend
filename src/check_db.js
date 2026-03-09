const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    const amenitiesCount = await prisma.amenity.count();
    const amenities = await prisma.amenity.findMany({ take: 5 });
    console.log('Tenants:', tenants);
    console.log('Total Amenities:', amenitiesCount);
    console.log('First 5 Amenities:', amenities);
    process.exit(0);
}
main();
