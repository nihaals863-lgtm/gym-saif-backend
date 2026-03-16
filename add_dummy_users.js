const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('123', 10);

    console.log("Ensuring Default Gym (Tenant 1) exists...");
    const testGym = await prisma.tenant.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            name: 'Default Gym',
            branchName: 'Main Branch',
            owner: 'Test Owner',
            phone: '1234567890',
            location: '123 Fitness St, Fit City',
            status: 'Active'
        }
    });

    // Create Users
    console.log("Adding users...");
    const users = [
        { email: 'superadmin@gmail.com', name: 'Super Admin', role: 'SUPER_ADMIN', tenantId: null },
        { email: 'admin@gmail.com', name: 'Branch Admin', role: 'BRANCH_ADMIN', tenantId: 1 },
        { email: 'manager@gmail.com', name: 'Gym Manager', role: 'MANAGER', tenantId: 1 },
        { email: 'staff@gmail.com', name: 'Gym Staff', role: 'STAFF', tenantId: 1 },
        { email: 'trainer@gmail.com', name: 'Gym Trainer', role: 'TRAINER', tenantId: 1 },
        { email: 'member@gmail.com', name: 'Gym Member', role: 'MEMBER', tenantId: 1 }
    ];

    for (const u of users) {
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {
                password: hashedPassword,
                role: u.role,
                tenantId: u.tenantId,
                status: 'Active'
            },
            create: {
                email: u.email,
                password: hashedPassword,
                name: u.name,
                role: u.role,
                status: 'Active',
                tenantId: u.tenantId
            }
        });
        console.log(`Created/Updated user: ${u.email} (${u.role})`);
    }

    console.log("\nDummy users creation completed successfully.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
