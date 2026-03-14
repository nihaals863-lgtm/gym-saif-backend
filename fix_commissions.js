const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMissedCommissions() {
    try {
        const invoiceId = 4; // Recent PT invoice
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { member: { include: { trainer: true } } }
        });

        if (!invoice || !invoice.member || !invoice.member.trainer) {
            console.log('Invoice or Trainer not found');
            return;
        }

        const member = invoice.member;
        const trainer = member.trainer;
        
        let commissionPercent = 0;
        if (trainer.config) {
            const config = typeof trainer.config === 'string' ? JSON.parse(trainer.config) : trainer.config;
            commissionPercent = parseFloat(config.commission) || parseFloat(config.commissionPercent) || parseFloat(config.ptSharePercent) || 0;
        }

        if (commissionPercent === 0) {
            console.log('Commission percentage is 0 in trainer config');
            return;
        }

        const accounts = await prisma.pTMemberAccount.findMany({
            where: { memberId: member.id, status: 'Active' },
            include: { package: true }
        });

        for (const account of accounts) {
            const existing = await prisma.commission.findFirst({
                where: { invoiceId: invoice.id, ptAccountId: account.id }
            });
            if (existing) {
                console.log(`Commission already exists for account ${account.id}`);
                continue;
            }

            const pkg = account.package;
            const totalCommission = (parseFloat(pkg.price) * commissionPercent) / 100;
            const months = Math.max(1, Math.round(pkg.validityDays / 30));
            const monthlyAmount = totalCommission / months;
            
            console.log(`Generating ${months} months of commission for ${member.name}. Total: ${totalCommission}, Monthly: ${monthlyAmount}`);

            for (let i = 0; i < months; i++) {
                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + i);
                
                await prisma.commission.create({
                    data: {
                        tenantId: invoice.tenantId,
                        trainerId: trainer.id,
                        memberId: member.id,
                        invoiceId: invoice.id,
                        ptAccountId: account.id,
                        amount: monthlyAmount,
                        month: targetDate.getMonth() + 1,
                        year: targetDate.getFullYear(),
                        status: 'Pending',
                        description: `[FIX] Monthly portion for PT Package: ${pkg.name} (Month ${i + 1}/${months})`
                    }
                });
            }
        }
        console.log('Finished fixing commissions');

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

fixMissedCommissions();
