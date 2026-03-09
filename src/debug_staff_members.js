const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugGetMembers() {
    // Simulate req.user for staff@gym.com (id 37, tenantId 1)
    const user = { id: 37, tenantId: 1, role: 'STAFF' };

    // Simulate getMembers logic
    const userTenantId = user.tenantId;
    const role = user.role;
    const rawTargetId = undefined; // No header/query

    let where = {};
    if (role === 'SUPER_ADMIN') {
        // ...
    } else {
        if (rawTargetId && rawTargetId !== 'all' && rawTargetId !== 'undefined') {
            where.tenantId = parseInt(rawTargetId);
        } else {
            where.tenantId = userTenantId || 1;
        }
    }

    console.log('Final Where Clause:', where);

    const members = await prisma.member.findMany({
        where,
        include: { tenant: { select: { name: true } } },
        orderBy: { name: 'asc' }
    });

    console.log('Found Members count:', members.length);
    console.log('Members:', members.map(m => ({ id: m.id, name: m.name, tenantId: m.tenantId })));
    process.exit(0);
}

debugGetMembers();
