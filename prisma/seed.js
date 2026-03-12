// gym_backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('123', 10);

    // Cleanup existing data in correct order to avoid FK constraints
    console.log("Cleaning up database...");
    
    // Level 4 (Deepest dependencies)
    await prisma.invoiceItem.deleteMany();
    await prisma.storeOrderItem.deleteMany();
    await prisma.maintenanceRequest.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.transaction.deleteMany();

    // Level 3 (Depends on Level 2)
    await prisma.booking.deleteMany();
    await prisma.memberProgress.deleteMany();
    await prisma.pTSession.deleteMany();
    await prisma.chatMessage.deleteMany();

    // Level 2 (Depends on Level 1: Member/Lead/User)
    await prisma.serviceRequest.deleteMany();
    await prisma.pTMemberAccount.deleteMany();
    await prisma.storeOrder.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.locker.deleteMany();
    await prisma.attendance.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.payroll.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.task.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.reward.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.dietPlan.deleteMany();
    await prisma.workoutPlan.deleteMany();

    // Level 1 (Depends on Level 0: Tenant/User/Plan)
    await prisma.member.deleteMany();
    await prisma.class.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.storeProduct.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.amenity.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.messageTemplate.deleteMany();
    await prisma.communicationLog.deleteMany();
    await prisma.tenantSettings.deleteMany();
    await prisma.trainerAvailability.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.pTPackage.deleteMany();

    // Level 0 (Base models)
    await prisma.membershipPlan.deleteMany();
    await prisma.user.deleteMany();
    await prisma.expenseCategory.deleteMany();
    await prisma.storeCategory.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.saaSPlan.deleteMany();
    await prisma.saasPayment.deleteMany();
    await prisma.webhookLog.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.device.deleteMany();
    await prisma.tenant.deleteMany();

    console.log("Database cleared.");

    // Create Default Gym (Tenant)
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
    console.log("Creating users...");
    const users = [
        { email: 'superadmin@gmail.com', name: 'Super Admin', role: 'SUPER_ADMIN', tenantId: null },
        { email: 'admin@gmail.com', name: 'Branch Admin', role: 'BRANCH_ADMIN', tenantId: 1 },
        { email: 'manager@gmail.com', name: 'Gym Manager', role: 'MANAGER', tenantId: 1 },
        { email: 'staff@gmail.com', name: 'Gym Staff', role: 'STAFF', tenantId: 1 },
        { email: 'trainer@gmail.com', name: 'Gym Trainer', role: 'TRAINER', tenantId: 1 },
        { email: 'member@gmail.com', name: 'Gym Member', role: 'MEMBER', tenantId: 1 }
    ];

    for (const u of users) {
        await prisma.user.upsert({
            where: { email: u.email },
            update: {
                password: hashedPassword,
                role: u.role,
                tenantId: u.tenantId
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
    }

    const trainer = await prisma.user.findFirst({ where: { role: 'TRAINER', tenantId: 1 } });
    const superadmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    const memberUser = await prisma.user.findFirst({ where: { email: 'member@gmail.com' } });

    // Create dummy Membership Plan
    const elitePlan = await prisma.membershipPlan.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            tenantId: testGym.id,
            name: 'Gold Elite Plan',
            price: 5000,
            duration: 12,
            durationType: 'Months',
            benefits: JSON.stringify([
                { name: 'Sauna', limit: 4 },
                { name: 'Ice Bath', limit: 2 },
                { name: 'PT Sessions', limit: 10 }
            ])
        }
    });

    // Create Dummy Member Profile
    const member = await prisma.member.upsert({
        where: {
            memberId: 'MEM-001'
        },
        update: {
            userId: memberUser.id,
            tenantId: testGym.id,
            trainerId: trainer.id,
            planId: elitePlan.id,
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        },
        create: {
            memberId: 'MEM-001',
            email: 'member@gym.com',
            userId: memberUser.id,
            name: 'Test Member',
            phone: '9876543210',
            status: 'Active',
            fitnessGoal: 'Weight Loss & Muscle Gain',
            targetWeight: 75.0,
            targetBodyFat: 14.0,
            tenantId: testGym.id,
            joinDate: new Date(),
            trainerId: trainer.id,
            planId: elitePlan.id,
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        }
    });

    // Create Initial Progress Logs for Member
    await prisma.memberProgress.createMany({
        data: [
            {
                memberId: member.id,
                weight: 85.0,
                bodyFat: 22.0,
                measurements: JSON.stringify({ chest: 100, waist: 95, arms: 35, legs: 60 }),
                notes: 'Baseline measurements',
                date: new Date(new Date().setDate(new Date().getDate() - 30))
            },
            {
                memberId: member.id,
                weight: 82.5,
                bodyFat: 20.5,
                measurements: JSON.stringify({ chest: 101, waist: 92, arms: 36, legs: 61 }),
                notes: 'Significant waist reduction',
                date: new Date(new Date().setDate(new Date().getDate() - 15))
            },
            {
                memberId: member.id,
                weight: 80.2,
                bodyFat: 19.0,
                measurements: JSON.stringify({ chest: 102, waist: 88, arms: 37, legs: 62 }),
                notes: 'On track for goals',
                date: new Date()
            }
        ]
    });

    // Create dummy Classes
    await prisma.class.deleteMany();
    const trainingClass = await prisma.class.create({
        data: {
            tenantId: testGym.id,
            name: 'Morning Power Hour',
            description: 'Intense strength training session',
            trainerId: trainer.id,
            schedule: JSON.stringify({ days: ['Mon', 'Wed', 'Fri'], time: '09:00 AM' }),
            maxCapacity: 20
        }
    });

    const hiitClass = await prisma.class.create({
        data: {
            tenantId: testGym.id,
            name: 'HIIT Blast',
            description: 'High intensity interval training',
            trainerId: trainer.id,
            schedule: JSON.stringify({ days: ['Tue', 'Thu'], time: '10:00 AM' }),
            maxCapacity: 15
        }
    });

    const boxingClass = await prisma.class.create({
        data: {
            tenantId: testGym.id,
            name: 'Boxing Basics',
            description: 'Learn the fundamentals of boxing',
            trainerId: trainer.id,
            schedule: JSON.stringify({ days: ['Sat'], time: '11:00 AM' }),
            maxCapacity: 10
        }
    });

    // Facility Classes (for Recovery Zone)
    const saunaClass = await prisma.class.create({
        data: {
            tenantId: testGym.id,
            name: 'Sauna Session',
            description: 'Relax and detox in our premium sauna',
            trainerId: null,
            schedule: JSON.stringify({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], time: '08:00 AM - 10:00 PM' }),
            maxCapacity: 5,
            requiredBenefit: 'Sauna'
        }
    });

    const iceBathClass = await prisma.class.create({
        data: {
            tenantId: testGym.id,
            name: 'Ice Bath Session',
            description: 'Post-workout recovery session',
            trainerId: null,
            schedule: JSON.stringify({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], time: '08:00 AM - 10:00 PM' }),
            maxCapacity: 2,
            requiredBenefit: 'Ice Bath'
        }
    });

    // Create trainer attendance for current month
    await prisma.attendance.deleteMany();
    await prisma.attendance.createMany({
        data: [
            { tenantId: testGym.id, userId: trainer.id, date: new Date(), checkIn: new Date(), status: 'Present', type: 'Trainer' },
            { tenantId: testGym.id, userId: trainer.id, date: new Date(new Date().setDate(new Date().getDate() - 1)), checkIn: new Date(), status: 'Present', type: 'Trainer' },
            { tenantId: testGym.id, userId: trainer.id, date: new Date(new Date().setDate(new Date().getDate() - 2)), checkIn: new Date(), status: 'Late', type: 'Trainer' }
        ]
    });

    // Create dummy Booking
    await prisma.booking.deleteMany();
    await prisma.booking.create({
        data: {
            memberId: member.id,
            classId: trainingClass.id,
            date: new Date(),
            status: 'Completed'
        }
    });

    // Create dummy Announcement
    await prisma.announcement.deleteMany();
    await prisma.announcement.create({
        data: {
            tenantId: testGym.id,
            title: 'New Boxing Batch',
            content: 'Boxing batch starting from this Monday for all elite members.',
            priority: 1,
            targetRole: 'member',
            authorId: superadmin.id
        }
    });

    // Create dummy Coupons
    await prisma.coupon.deleteMany();
    await prisma.coupon.createMany({
        data: [
            {
                tenantId: testGym.id,
                code: 'WELCOME10',
                description: 'Welcome discount for new members',
                type: 'Percentage',
                value: 10,
                minPurchase: 1000,
                maxUses: 100,
                usedCount: 45,
                status: 'Active'
            },
            {
                tenantId: testGym.id,
                code: 'FESTIVE500',
                description: 'Special festive fixed discount',
                type: 'Fixed',
                value: 500,
                minPurchase: 5000,
                maxUses: 50,
                usedCount: 12,
                status: 'Active'
            },
            {
                tenantId: testGym.id,
                code: 'SUMMER20',
                description: 'Limited time summer offer',
                type: 'Percentage',
                value: 20,
                minPurchase: 2000,
                maxUses: 200,
                usedCount: 198,
                status: 'Active'
            }
        ]
    });

    console.log("Seeding completed successfully.");
    console.log("--- Logins ---");
    console.log("SuperAdmin: superadmin@gmail.com / 123");
    console.log("BranchAdmin: admin@gmail.com / 123");
    console.log("Manager: manager@gmail.com / 123");
    console.log("Staff: staff@gmail.com / 123");
    console.log("Trainer: trainer@gmail.com / 123");
    console.log("Member: member@gmail.com / 123");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
