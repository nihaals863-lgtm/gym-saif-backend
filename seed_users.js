const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    // Check if tenant 1 exists, create one if not
    let tenant = await prisma.tenant.findUnique({ where: { id: 1 } });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                id: 1,
                name: 'Main Gym Branch',
                branchName: 'Downtown',
                status: 'Active'
            }
        });
        console.log('Created missing tenant ID 1');
    }

    const tenantId = 1;

    const users = [
        {
            email: 'manager@gym.com',
            name: 'GYM Manager',
            password: await bcrypt.hash('manager123', 10),
            role: 'MANAGER',
            tenantId
        },
        {
            email: 'staff@gym.com',
            name: 'GYM Staff',
            password: await bcrypt.hash('staff123', 10),
            role: 'STAFF',
            tenantId
        },
        {
            email: 'trainer@gym.com',
            name: 'GYM Trainer',
            password: await bcrypt.hash('trainer123', 10),
            role: 'TRAINER',
            tenantId
        },
        {
            email: 'member@gym.com',
            name: 'GYM Member',
            password: await bcrypt.hash('member123', 10),
            role: 'MEMBER',
            tenantId
        }
    ];

    for (const user of users) {
        await prisma.user.upsert({
            where: { email: user.email },
            update: { password: user.password, role: user.role, tenantId: user.tenantId },
            create: user
        });
        console.log(`Upserted ${user.email}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
