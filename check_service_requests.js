const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const requests = await prisma.serviceRequest.findMany({
            include: {
                member: {
                    select: { name: true, memberId: true }
                }
            }
        });
        console.log('--- Service Requests ---');
        console.log(JSON.stringify(requests, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
