const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugState() {
    try {
        console.log('--- ALL COMMISSIONS ---');
        const commissions = await prisma.commission.findMany();
        console.log(JSON.stringify(commissions, null, 2));

        console.log('\n--- MEMBERS With TRAINERS ---');
        const members = await prisma.member.findMany({
            include: { trainer: { select: { id: true, name: true } } }
        });
        members.forEach(m => {
            console.log(`Member: ${m.name} (ID: ${m.id}), Trainer: ${m.trainer?.name || 'NONE'} (ID: ${m.trainerId})`);
        });

        console.log('\n--- RECENT INVOICES ---');
        const invoices = await prisma.invoice.findMany({
            take: 5,
            orderBy: { id: 'desc' }
        });
        console.log(JSON.stringify(invoices, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

debugState();
