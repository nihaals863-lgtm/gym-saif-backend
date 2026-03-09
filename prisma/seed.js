// gym_backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Cleanup existing data
    await prisma.booking.deleteMany();
    await prisma.attendance.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.memberProgress.deleteMany();
    await prisma.member.deleteMany();
    await prisma.class.deleteMany();
    await prisma.membershipPlan.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.storeOrderItem.deleteMany();
    await prisma.storeOrder.deleteMany();
    await prisma.storeProduct.deleteMany();
    await prisma.storeCategory.deleteMany();

    console.log("Database cleared.");

    // Create Superadmin
    const superadmin = await prisma.user.upsert({
        where: { email: 'admin@newgym.com' },
        update: {},
        create: {
            email: 'admin@newgym.com',
            password: hashedPassword,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
            status: 'Active',
        },
    });

    // Create Test Gym (Tenant)
    const testGym = await prisma.tenant.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            name: 'Test Elite Gym',
            branchName: 'Main Branch',
            owner: 'Test Owner',
            phone: '1234567890',
            location: '123 Fitness St, Fit City',
            status: 'Active'
        }
    });

    // Create Test Branch Admin
    const branchHashedPassword = await bcrypt.hash('123456', 10);
    const branchAdmin = await prisma.user.upsert({
        where: { email: 'testbranch@gym.com' },
        update: {
            tenantId: testGym.id // Ensure it's linked
        },
        create: {
            email: 'testbranch@gym.com',
            password: branchHashedPassword,
            name: 'Test Branch Admin',
            role: 'BRANCH_ADMIN',
            status: 'Active',
            tenantId: testGym.id
        },
    });

    // Create Dummy Manager
    const manager = await prisma.user.upsert({
        where: { email: 'manager@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'manager@gym.com',
            password: await bcrypt.hash('manager123', 10),
            name: 'Test Manager',
            role: 'MANAGER',
            status: 'Active',
            tenantId: testGym.id
        }
    });

    // Create Dummy Staff
    const staff = await prisma.user.upsert({
        where: { email: 'staff@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'staff@gym.com',
            password: await bcrypt.hash('staff123', 10),
            name: 'Test Staff',
            role: 'STAFF',
            status: 'Active',
            tenantId: testGym.id
        }
    });

    console.log("Creating store categories...");
    // Create dummy Product Categories
    const supplementsCategory = await prisma.storeCategory.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            tenantId: 1,
            name: "Supplements",
            description: "High quality protein, vitamins and pre-workouts",
            sortOrder: 1,
            status: "Active"
        }
    });

    const accessoriesCategory = await prisma.storeCategory.upsert({
        where: { id: 2 },
        update: {},
        create: {
            id: 2,
            tenantId: 1,
            name: "Accessories",
            description: "Gloves, belts, shakers and more",
            sortOrder: 2,
            status: "Active"
        }
    });

    // Create Dummy Trainer
    const trainer = await prisma.user.upsert({
        where: { email: 'trainer@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'trainer@gym.com',
            password: await bcrypt.hash('trainer123', 10),
            name: 'Test Trainer',
            role: 'TRAINER',
            status: 'Active',
            tenantId: testGym.id
        }
    });

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

    // Create Member User
    const memberUser = await prisma.user.upsert({
        where: { email: 'member@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'member@gym.com',
            password: await bcrypt.hash('member123', 10),
            name: 'Test Member',
            role: 'MEMBER',
            status: 'Active',
            tenantId: testGym.id
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
            priority: 'high',
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
    console.log("SuperAdmin: admin@newgym.com / admin123");
    console.log("BranchAdmin: testbranch@gym.com / 123456");
    console.log("Manager: manager@gym.com / manager123");
    console.log("Staff: staff@gym.com / staff123");
    console.log("Trainer: trainer@gym.com / trainer123");
    console.log("Member: member@gym.com / member123");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
