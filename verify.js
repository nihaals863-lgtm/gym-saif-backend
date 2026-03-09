const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const today = new Date();
        const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const mCount = await prisma.member.count({ 
            where: { status: { in: ['Active', 'active'] } } 
        });
        
        const revStr = await prisma.invoice.aggregate({ 
            where: { status: { in: ['Paid', 'paid'] }, paidDate: { gte: startOfThisMonth } }, 
            _sum: { amount: true } 
        });
        
        const duesStr = await prisma.invoice.aggregate({ 
            where: { status: { in: ['Unpaid', 'unpaid', 'Partial', 'Overdue'] } }, 
            _sum: { amount: true } 
        });
        
        const ret = await prisma.member.groupBy({ 
            by: ['status'], 
            _count: { id: true } 
        });
        
        const collectionTotal = await prisma.invoice.aggregate({
            where: { paidDate: { gte: startOfThisMonth } },
            _sum: { amount: true }
        });
        
        console.log('--- DB METRICS (ALL BRANCHES) ---');
        console.log('Active Members:', mCount);
        console.log('Revenue This Month:', revStr._sum.amount);
        console.log('Pending Dues:', duesStr._sum.amount);
        console.log('Retention:', ret);
        console.log('Total Collection Amount:', collectionTotal._sum.amount);
        
        const revTotal = await prisma.invoice.aggregate({ 
            where: { status: { in: ['Paid', 'paid'] } }, 
            _sum: { amount: true } 
        });
        console.log('LIFETIME REVENUE:', revTotal._sum.amount);

    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
