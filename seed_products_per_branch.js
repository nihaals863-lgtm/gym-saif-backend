const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCT_TEMPLATES = [
    { name: 'Resistance Band', sku: 'S-RESISTANCE-BAND', category: 'Equipment', price: 800, costPrice: 70, stock: 19, status: 'Active' },
    { name: 'Water Bottle', sku: 'S-WATER-BOTTLE', category: 'Accessories', price: 300, costPrice: 70, stock: 100, status: 'Active' },
    { name: 'Gym Gloves', sku: 'S-GYM-GLOVES', category: 'Accessories', price: 450, costPrice: 70, stock: 20, status: 'Active' },
    { name: 'Creatine Monohydrate', sku: 'S-CREATINE-MONO', category: 'Supplements', price: 1200, costPrice: 80, stock: 30, status: 'Active' },
    { name: 'Whey Protein', sku: 'S-WHEY-PROTEIN', category: 'Supplements', price: 2500, costPrice: 70, stock: 50, status: 'Active' },
];

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log('Found branches:', tenants.map(t => `${t.id}: ${t.name}`).join(', '));

    for (const tenant of tenants) {
        // Check if branch already has products
        const existing = await prisma.storeProduct.count({ where: { tenantId: tenant.id } });
        if (existing > 0) {
            console.log(`Branch ${tenant.name} already has ${existing} products, skipping.`);
            continue;
        }

        console.log(`Seeding products for branch: ${tenant.name} (${tenant.id})`);
        for (const template of PRODUCT_TEMPLATES) {
            await prisma.storeProduct.create({
                data: {
                    tenantId: tenant.id,
                    name: template.name,
                    sku: `${template.sku}-${tenant.id}`,
                    category: template.category,
                    price: template.price,
                    costPrice: template.costPrice,
                    stock: template.stock,
                    status: template.status,
                    taxRate: 0,
                    description: `${template.name} for ${tenant.name}`,
                }
            });
        }
        console.log(`✓ Added ${PRODUCT_TEMPLATES.length} products for ${tenant.name}`);
    }

    const total = await prisma.storeProduct.groupBy({ by: ['tenantId'], _count: { id: true } });
    console.log('\nFinal product counts per branch:', JSON.stringify(total, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
