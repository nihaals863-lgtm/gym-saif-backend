const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixKishan() {
    console.log("Fixing 'kishan' referral data...");
    
    // Find Kishan lead
    const lead = await prisma.lead.findFirst({
        where: { name: 'kishan' }
    });

    if (lead) {
        await prisma.lead.update({
            where: { id: lead.id },
            data: {
                source: 'Referral',
                notes: JSON.stringify({ referrerId: 'MEM-001' }) // Assuming MEM-001 is the referrer based on previous debug
            }
        });
        console.log("Kishan lead updated to Referral status.");
    } else {
        console.log("Kishan lead not found.");
    }

    await prisma.$disconnect();
}

fixKishan();
