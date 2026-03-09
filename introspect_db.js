const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        where: { name: { contains: 'Demo' } },
        include: { tenant: true }
    });
    console.log('--- USERS MATCHING DEMO ---');
    console.dir(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId })), { depth: null });

    if (users.length > 0) {
        console.log('--- TENANTS FOR DEMO USERS ---');
        for (const u of users) {
            console.log(`User: ${u.email} -> Owner matching name or email?`);
            const relatedTenants = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: u.tenantId },
                        { owner: u.email },
                        { owner: u.name }
                    ]
                }
            });
            console.dir(relatedTenants, { depth: null });
        }
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
