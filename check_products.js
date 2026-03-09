const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Check all products grouped by tenant
    const products = await prisma.storeProduct.findMany({
        select: { id: true, name: true, tenantId: true, status: true, stock: true },
        orderBy: [{ tenantId: 'asc' }, { name: 'asc' }]
    });

    const grouped = {};
    products.forEach(p => {
        if (!grouped[p.tenantId]) grouped[p.tenantId] = [];
        grouped[p.tenantId].push(p);
    });

    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    const tenantMap = {};
    tenants.forEach(t => tenantMap[t.id] = t.name);

    for (const [tenantId, prods] of Object.entries(grouped)) {
        console.log(`\n=== Branch: ${tenantMap[tenantId] || 'Unknown'} (tenantId: ${tenantId}) === ${prods.length} products`);
        prods.forEach(p => console.log(`  ID:${p.id} | ${p.name} | stock:${p.stock} | status:${p.status}`));
    }
    console.log(`\nTotal products: ${products.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
