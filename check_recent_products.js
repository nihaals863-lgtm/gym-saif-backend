const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const p = await prisma.storeProduct.findMany({
        where: { tenantId: 8 },
        select: { id: true, name: true, status: true, stock: true, sku: true }
    });
    p.forEach(x => console.log(x.id, x.name, 'status=' + x.status, 'stock=' + x.stock));
    console.log('Total for tenantId 8:', p.length);
}
main().finally(() => prisma.$disconnect());
