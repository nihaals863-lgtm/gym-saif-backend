const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFetchBranches() {
    const userEmail = 'testbranch@gym.com';
    const user = await prisma.user.findUnique({
        where: { email: userEmail },
        include: { tenant: true }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    const { role, tenantId, email, name } = user;
    console.log(`Simulating fetch for user: ${email}, role: ${role}, tenantId: ${tenantId}, name: ${name}`);

    let where = {};
    if (role === 'SUPER_ADMIN') {
        // Can see all branches
    } else if (role === 'BRANCH_ADMIN') {
        where = {
            OR: [
                { id: tenantId },
                { owner: email },
                { owner: name }
            ]
        };
    } else {
        where = { id: tenantId };
    }

    const branches = await prisma.tenant.findMany({
        where,
        select: { id: true, name: true, branchName: true, status: true, owner: true }
    });

    const formatted = branches.map(b => ({
        ...b,
        name: b.branchName || b.name
    }));

    console.log('--- FOUND BRANCHES ---');
    console.dir(formatted, { depth: null });
}

testFetchBranches().catch(console.error).finally(() => prisma.$disconnect());
