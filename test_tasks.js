const prisma = require('./src/config/prisma');

async function testGetTasks() {
    try {
        const userTenantId = 1; // Assuming tenant 1
        const role = 'BRANCH_ADMIN';
        const email = 'testbranch@gym.com';
        const userName = 'Test Branch Admin';
        const branchId = null;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId) where.tenantId = parseInt(branchId);
        } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [];
                if (userTenantId) orConditions.push({ id: userTenantId });
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                // Fetch tasks for all managed branches
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: orConditions.length > 0 ? orConditions : undefined
                    },
                    select: { id: true }
                });
                const managedIds = branches.map(b => b.id);
                where.tenantId = { in: managedIds };
            }
        } else {
            where.tenantId = userTenantId;
        }

        console.log("WHERE filter:", JSON.stringify(where, null, 2));

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        console.log("Tasks length:", tasks.length);

    } catch (e) {
        console.error("PRISMA ERROR:", e);
    }
}

testGetTasks();
