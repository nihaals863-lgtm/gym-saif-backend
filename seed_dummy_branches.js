const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    // 1. Add 2 branches to the existing branch admin's owner
    // First, find the existing branch admin
    const existingAdmin = await prisma.user.findUnique({
        where: { email: 'testbranch@gym.com' },
        include: { tenant: true }
    });

    if (existingAdmin) {
        // Create 2 new branches (Tenants)
        await prisma.tenant.create({
            data: {
                name: 'Elite Gym - Downtown',
                branchName: 'Downtown Branch',
                owner: existingAdmin.email, // using email to link
                phone: '1234567891',
                location: 'Downtown City Center',
                status: 'Active'
            }
        });

        await prisma.tenant.create({
            data: {
                name: 'Elite Gym - Uptown',
                branchName: 'Uptown Branch',
                owner: existingAdmin.email, // using email to link
                phone: '1234567892',
                location: 'Uptown Suburbs',
                status: 'Active'
            }
        });

        // Ensure the exist admin's tenant has the owner set consistently 
        if (existingAdmin.tenant) {
            await prisma.tenant.update({
                where: { id: existingAdmin.tenant.id },
                data: { owner: existingAdmin.email }
            });
        }
        console.log('Successfully created 2 extra branches for testbranch@gym.com');
    }

    // 2. Create one more branch admin
    const newAdminEmail = 'newbranchadmin@gym.com';
    const newAdminPasswordStr = '123456';
    const hashedPassword = await bcrypt.hash(newAdminPasswordStr, 10);

    const newTenant = await prisma.tenant.create({
        data: {
            name: 'New Test Gym',
            branchName: 'Main Branch',
            owner: newAdminEmail,
            phone: '9876543210',
            location: 'New City',
            status: 'Active'
        }
    });

    const newAdmin = await prisma.user.create({
        data: {
            email: newAdminEmail,
            password: hashedPassword,
            name: 'New Branch Admin',
            role: 'BRANCH_ADMIN',
            tenantId: newTenant.id,
            status: 'Active'
        }
    });

    console.log(`\nSuccessfully created new branch admin!`);
    console.log(`Email: ${newAdminEmail}`);
    console.log(`Password: ${newAdminPasswordStr}`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
