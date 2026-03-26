const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const devices = await prisma.device.findMany();
        console.log('Devices in database:');
        console.log(JSON.stringify(devices, null, 2));
    } catch (error) {
        console.error('Error querying devices:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
