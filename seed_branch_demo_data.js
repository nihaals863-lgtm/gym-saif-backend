const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting dummy data generation for branches...');

    // 1. Find the test admin and their branches
    const adminEmail = 'testbranch@gym.com';
    const admin = await prisma.user.findUnique({
        where: { email: adminEmail }
    });

    if (!admin) {
        console.error('Test admin not found. Please run seed_dummy_branches.js first.');
        return;
    }

    // Get all tenants (branches) owned by this admin
    const branches = await prisma.tenant.findMany({
        where: { owner: adminEmail }
    });

    if (branches.length === 0) {
        console.error('No branches found for this admin.');
        return;
    }

    console.log(`Found ${branches.length} branches. Seeding data...`);

    const statuses = ['Active', 'Expired', 'Inactive'];
    const paymentModes = ['Cash', 'UPI', 'Card'];

    for (const branch of branches) {
        const tenantId = branch.id;
        console.log(`\n--- Seeding branch: ${branch.name} (ID: ${tenantId}) ---`);

        // A. Create Plans
        const plans = [];
        for (let i = 1; i <= 3; i++) {
            const plan = await prisma.membershipPlan.create({
                data: {
                    tenantId,
                    name: `${branch.branchName || 'Branch'} Plan ${i}`,
                    price: 1500 * i,
                    duration: i,
                    durationType: 'Months',
                    status: 'Active'
                }
            });
            plans.push(plan);
        }

        // B. Create Members
        const members = [];
        for (let i = 1; i <= 15; i++) {
            const joinDate = new Date();
            joinDate.setMonth(joinDate.getMonth() - Math.floor(Math.random() * 6));
            
            const expiryDate = new Date(joinDate);
            expiryDate.setMonth(expiryDate.getMonth() + 1 + Math.floor(Math.random() * 3));

            const status = new Date() > expiryDate ? 'Expired' : 'Active';

            const member = await prisma.member.create({
                data: {
                    tenantId,
                    memberId: `MEM-${tenantId}-${i}-${Math.floor(Math.random() * 1000)}`,
                    name: `Member ${i} (${branch.branchName})`,
                    phone: `999${tenantId}${i.toString().padStart(4, '0')}`,
                    status: status,
                    planId: plans[Math.floor(Math.random() * plans.length)].id,
                    joinDate,
                    expiryDate
                }
            });
            members.push(member);
        }

        // C. Create Invoices (Revenue)
        for (let i = 1; i <= 20; i++) {
            const member = members[Math.floor(Math.random() * members.length)];
            const isPaid = Math.random() > 0.2;
            const amount = 1500 + Math.floor(Math.random() * 3000);
            
            const date = new Date();
            if (i > 10) {
                // Some older invoices
                date.setMonth(date.getMonth() - 1);
            }

            await prisma.invoice.create({
                data: {
                    tenantId,
                    invoiceNumber: `INV-${tenantId}-${i}-${Math.floor(Math.random() * 1000)}`,
                    memberId: member.id,
                    amount: amount,
                    status: isPaid ? 'Paid' : 'Unpaid',
                    dueDate: date,
                    paidDate: isPaid ? date : null,
                    paymentMode: paymentModes[Math.floor(Math.random() * paymentModes.length)]
                }
            });
        }

        // D. Create Attendances (Check-ins)
        for (let i = 1; i <= 30; i++) {
            const member = members[Math.floor(Math.random() * members.length)];
            const date = new Date();
            if (i > 15) {
                // Older attendance
                date.setDate(date.getDate() - Math.floor(Math.random() * 10));
            }

            await prisma.attendance.create({
                data: {
                    tenantId,
                    memberId: member.id,
                    type: 'Member',
                    date: date,
                    checkIn: date,
                    status: 'Present'
                }
            });
        }

        // E. Create Equipment
        for (let i = 1; i <= 5; i++) {
            await prisma.equipment.create({
                data: {
                    tenantId,
                    name: `Treadmill Model ${i} - ${branch.branchName}`,
                    status: i === 5 ? 'Maintenance' : 'Operational',
                    category: 'Cardio'
                }
            });
        }
        
        // F. Create Expenses
        for (let i = 1; i <= 5; i++) {
            const amount = 500 + Math.floor(Math.random() * 2000);
            await prisma.expense.create({
                data: {
                    tenantId,
                    title: `Utility Bill ${i}`,
                    category: 'Utilities',
                    amount: amount,
                    date: new Date(),
                    status: 'Paid'
                }
            });
        }

        console.log(`Seeding for branch ${branch.name} completed.`);
    }

    console.log('\nAll branch demo data seeded successfully!');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
