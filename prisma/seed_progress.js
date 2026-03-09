const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Seeding progress data...');
    const user = await prisma.user.findUnique({
        where: { email: 'member@gym.com' }
    });

    if (!user) {
        console.log('User not found, skipping progress seed.');
        return;
    }

    const member = await prisma.member.findUnique({
        where: { userId: user.id }
    });

    if (!member) {
        console.log('Member not found, skipping progress seed.');
        return;
    }

    const progressData = [
        {
            memberId: member.id,
            weight: 85.5,
            bodyFat: 22.1,
            measurements: { chest: 102, waist: 88, arms: 36, legs: 58 },
            date: new Date('2024-01-01')
        },
        {
            memberId: member.id,
            weight: 83.1,
            bodyFat: 21.2,
            measurements: { chest: 103, waist: 86, arms: 37, legs: 59 },
            date: new Date('2024-02-01')
        },
        {
            memberId: member.id,
            weight: 80.5,
            bodyFat: 19.2,
            measurements: { chest: 104, waist: 84, arms: 38, legs: 60 },
            date: new Date('2024-03-01')
        },
        {
            memberId: member.id,
            weight: 79.8,
            bodyFat: 18.5,
            measurements: { chest: 104, waist: 82, arms: 38.5, legs: 61 },
            date: new Date('2024-04-01')
        }
    ];

    for (const p of progressData) {
        await prisma.memberProgress.create({ data: p });
    }

    console.log('Progress data seeded!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
