const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const reqUser = { email: 'admin@newgym.com', role: 'SUPER_ADMIN', tenantId: null, name: 'Super Admin' };
    const reqHeaders = { 'x-tenant-id': 'all' };

    const { tenantId: userTenantId, role, email, name: userName } = reqUser;
    const headerTenantId = reqHeaders['x-tenant-id'];
    const where = {};

    if (role === 'SUPER_ADMIN') {
        if (headerTenantId && headerTenantId !== 'all') {
            where.tenantId = parseInt(headerTenantId);
        }
    } else {
        if (headerTenantId && headerTenantId !== 'all') {
            where.tenantId = parseInt(headerTenantId);
        } else {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId || -1 },
                        { owner: email },
                        { owner: userName }
                    ]
                },
                select: { id: true }
            });
            const managedBranchIds = branches.map(b => b.id);
            where.tenantId = { in: managedBranchIds };
        }
    }

    const amenities = await prisma.amenity.findMany({
        where,
        orderBy: { name: 'asc' }
    });

    console.log('Resulting WHERE:', where);
    console.log('Found Amenities:', amenities.length);
    process.exit(0);
}
main();
