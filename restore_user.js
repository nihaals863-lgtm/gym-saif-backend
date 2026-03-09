const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    try {
        const hashedPassword = await bcrypt.hash('123456', 10);

        // Ensure tenant exists first
        let tenant = await prisma.tenant.findFirst({ where: { id: 1 } });
        if (!tenant) {
            tenant = await prisma.tenant.create({
                data: {
                    name: 'Test Elite Gym',
                    branchName: 'Main Branch',
                    status: 'Active'
                }
            });
            console.log('Created missing tenant');
        }

        const user = await prisma.user.upsert({
            where: { email: 'testbranch@gym.com' },
            update: {
                password: hashedPassword,
                role: 'BRANCH_ADMIN',
                status: 'Active',
                tenantId: tenant.id
            },
            create: {
                email: 'testbranch@gym.com',
                password: hashedPassword,
                name: 'Test Branch Admin',
                role: 'BRANCH_ADMIN',
                status: 'Active',
                tenantId: tenant.id
            }
        });
        console.log('Branch Admin restored:', user);
    } catch (error) {
        console.error("Error restoring user:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
