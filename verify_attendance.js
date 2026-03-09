const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const currentlyInAll = await prisma.attendance.count({ where: { checkOut: null } });
        const totalTodayAll = await prisma.attendance.count({ where: { checkIn: { gte: today, lt: tomorrow } } });
        
        console.log('--- ALL BRANCHES (No filter) ---');
        console.log('In:', currentlyInAll, 'Today:', totalTodayAll);
        
        const currentlyInT1 = await prisma.attendance.count({ where: { tenantId: 1, checkOut: null } });
        const totalTodayT1 = await prisma.attendance.count({ where: { tenantId: 1, checkIn: { gte: today, lt: tomorrow } } });
        
        console.log('--- BRANCH 1 (Manager Base Branch) ---');
        console.log('In:', currentlyInT1, 'Today:', totalTodayT1);

    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
