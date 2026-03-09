const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branchIds = [1, 2, 3];
    const amenities = [
        { name: 'WiFi', icon: 'Wifi', description: 'High-speed internet access' },
        { name: 'Locker access', icon: 'Lock', description: 'Personal locker during workouts' },
        { name: 'Towel Service', icon: 'Bath', description: 'Fresh towels available' }
    ];

    for (const tId of branchIds) {
        for (const am of amenities) {
            await prisma.amenity.upsert({
                where: { id: -1 }, // Just create for now
                create: {
                    tenantId: tId,
                    ...am,
                    status: 'Active',
                    gender: 'UNISEX'
                },
                update: {}
            });
        }
    }
    console.log('Amenities seeded for branches 1, 2, 3');
    process.exit(0);
}
main();
