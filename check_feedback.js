const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const feedbacks = await prisma.feedback.findMany();

        const memberIds = feedbacks.map(f => f.memberId).filter(Boolean);
        let membersMap = {};
        if (memberIds.length > 0) {
            const members = await prisma.member.findMany({
                where: { id: { in: memberIds } },
                select: { id: true, name: true }
            });
            members.forEach(m => {
                membersMap[m.id] = m.name;
            });
        }

        const formatted = feedbacks.map(f => ({
            ...f,
            memberName: membersMap[f.memberId] || 'Anonymous'
        }));

        console.log('--- Feedback Records ---');
        console.log(JSON.stringify(formatted, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
