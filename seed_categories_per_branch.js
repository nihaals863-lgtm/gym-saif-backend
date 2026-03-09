const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATEGORY_TEMPLATES = [
    { name: 'Supplements', description: 'Protein, creatine and other supplements', sortOrder: 1, status: 'Active' },
    { name: 'Equipment', description: 'Gym equipment and training accessories', sortOrder: 2, status: 'Active' },
    { name: 'Accessories', description: 'Gloves, belts, straps and accessories', sortOrder: 3, status: 'Active' },
    { name: 'Apparel', description: 'Gym wear and clothing', sortOrder: 4, status: 'Active' },
];

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log('Found branches:', tenants.map(t => `${t.id}: ${t.name}`).join(', '));

    for (const tenant of tenants) {
        const existing = await prisma.storeCategory.count({ where: { tenantId: tenant.id } });
        if (existing > 0) {
            console.log(`Branch ${tenant.name} already has ${existing} categories, skipping.`);
            continue;
        }

        console.log(`Seeding categories for branch: ${tenant.name} (${tenant.id})`);
        for (const template of CATEGORY_TEMPLATES) {
            await prisma.storeCategory.create({
                data: {
                    tenantId: tenant.id,
                    name: template.name,
                    description: template.description,
                    sortOrder: template.sortOrder,
                    status: template.status,
                }
            });
        }
        console.log(`✓ Added ${CATEGORY_TEMPLATES.length} categories for ${tenant.name}`);
    }

    const total = await prisma.storeCategory.groupBy({ by: ['tenantId'], _count: { id: true } });
    console.log('\nFinal category counts per branch:', JSON.stringify(total, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
