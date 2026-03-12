const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkKishan() {
    console.log("Searching for 'kishan' in Leads...");
    const leads = await prisma.lead.findMany({
        where: { name: { contains: 'kishan' } }
    });
    console.log("Leads found:", JSON.stringify(leads, null, 2));

    console.log("\nSearching for 'kishan' in Members...");
    const members = await prisma.member.findMany({
        where: { name: { contains: 'kishan' } }
    });
    console.log("Members found:", JSON.stringify(members, null, 2));

    await prisma.$disconnect();
}

checkKishan();
