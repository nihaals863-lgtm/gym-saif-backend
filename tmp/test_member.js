const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const member = await prisma.member.findUnique({
            where: { id: 11 },
            include: {
                trainer: true,
                tenant: true,
                plan: true,
                storeOrders: {
                    include: {
                        items: {
                            include: {
                                product: true
                            }
                        }
                    }
                },
                invoices: {
                    include: {
                        items: true
                    }
                }
            }
        });
        const formatted = {
            ...member,
            healthConditions: member.medicalHistory,
            planName: member.plan?.name || 'No Plan',
            branch: member.tenant?.name || 'Main Branch',
            joinDate: member.joinDate ? member.joinDate.toISOString() : null,
            expiryDate: member.expiryDate ? member.expiryDate.toISOString() : null,
        };
        console.log('FORMATTED MEMBER 11:', JSON.stringify(formatted, null, 2));
    } catch (e) {
        console.error('ERROR FETCHING MEMBER 11:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
