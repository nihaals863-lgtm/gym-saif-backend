require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded' : 'Not Loaded');

async function checkInvoice() {
    try {
        const invoiceId = 14;
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { tenant: true }
        });

        if (!invoice) {
            console.log('Invoice not found');
            return;
        }

        console.log('--- INVOICE #14 ---');
        console.log('Invoice Tenant ID:', invoice.tenantId);
        console.log('Branch Name:', invoice.tenant?.name);
        console.log('Branch Owner (in DB):', invoice.tenant?.owner);

        // Assuming the user is "saif" or "admin"
        const users = await prisma.user.findMany({
            where: { role: 'BRANCH_ADMIN' }
        });

        console.log('\n--- BRANCH ADMINS ---');
        users.forEach(u => {
            console.log(`User: ${u.name}, Email: ${u.email}, TenantID: ${u.tenantId}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkInvoice();
