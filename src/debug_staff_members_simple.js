const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugGetMembers() {
    const user = { id: 37, tenantId: 1, role: 'STAFF' };
    let where = { tenantId: 1 };

    console.log('Final Where Clause:', where);

    const members = await prisma.member.findMany({
        where,
        orderBy: { name: 'asc' }
    });

    console.log('Found Members count:', members.length);
    console.log('Members:', members.map(m => ({ id: m.id, name: m.name, tenantId: m.tenantId })));
    process.exit(0);
}

debugGetMembers();
