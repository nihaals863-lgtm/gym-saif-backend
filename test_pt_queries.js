const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function testController() {
    try {
        const tenantId = 1; // Testing for tenant 1
        const where = { tenantId };

        console.log('Testing queries...');
        const [totalPackages, activeAccounts, sessionsToday] = await Promise.all([
            prisma.pTPackage.count({ where }),
            prisma.pTMemberAccount.count({ where: { ...where, status: 'Active' } }),
            prisma.pTSession.count({
                where: {
                    ...where,
                    date: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lte: new Date(new Date().setHours(23, 59, 59, 999))
                    }
                }
            })
        ]);

        console.log('Results:', { totalPackages, activeAccounts, sessionsToday });

        const packages = await prisma.pTPackage.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        console.log('Packages found:', packages.length);

        const accounts = await prisma.pTMemberAccount.findMany({
            where: { status: 'Active' },
            include: {
                member: { select: { id: true, name: true, memberId: true } },
                package: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        console.log('Accounts found:', accounts.length);

        const sessions = await prisma.pTSession.findMany({
            where,
            include: {
                member: { select: { id: true, name: true } },
                trainer: { select: { id: true, name: true } },
                ptAccount: {
                    include: { package: { select: { name: true } } }
                }
            },
            orderBy: { date: 'desc' }
        });
        console.log('Sessions found:', sessions.length);

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testController();
