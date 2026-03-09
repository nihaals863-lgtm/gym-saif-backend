const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const leads = await prisma.lead.findMany({
            where: { source: 'Referral' }
        });
        console.log('--- Referral Leads ---');
        console.log(JSON.stringify(leads, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
