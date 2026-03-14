const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenantId = 1;

    console.log('Cleaning up existing dummy store data...');
    // We only clean up if they have dummy-sounding names to avoid accidental data loss of real products
    // but the user asked for dummy data specifically, so we might as well just add.
    
    console.log('Creating categories...');
    const categories = [
        { name: 'Supplements', description: 'Protein powders, vitamins and more' },
        { name: 'Gym Gear', description: 'Equipment and accessories for your workout' },
        { name: 'Apparel', description: 'Quality workout clothes and footwear' },
        { name: 'Accessories', description: 'Belts, gloves and other essentials' }
    ];

    const createdCategories = [];
    for (const cat of categories) {
        const category = await prisma.storeCategory.upsert({
            where: { id: categories.indexOf(cat) + 1 }, // Simple id assignment for script
            update: { name: cat.name, description: cat.description, tenantId },
            create: { name: cat.name, description: cat.description, tenantId }
        });
        createdCategories.push(category);
    }

    const products = [
        // Supplements
        { name: 'Premium Whey Protein', price: 2499, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&q=80&w=800' },
        { name: 'Creatine Monohydrate', price: 1299, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Extreme Pre-Workout', price: 1899, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=800' },
        { name: 'BCAA Recovery Complex', price: 1499, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1579722820308-d74e57198c76?auto=format&fit=crop&q=80&w=800' },
        { name: 'Mass Gainer 5kg', price: 3999, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&q=80&w=800' },
        { name: 'Daily Multivitamins', price: 899, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=800' },
        { name: 'Casein Protein Night', price: 2199, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&q=80&w=800' },
        { name: 'Omega-3 Fish Oil', price: 749, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=800' },
        { name: 'L-Glutamine Powder', price: 1199, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1579722820308-d74e57198c76?auto=format&fit=crop&q=80&w=800' },
        { name: 'Protein Bar Box (12pcs)', price: 1599, categoryId: createdCategories[0].id, image: 'https://images.unsplash.com/photo-1610725621622-18bc347669d1?auto=format&fit=crop&q=80&w=800' },

        // Gym Gear
        { name: 'Cast Iron Kettlebell 16kg', price: 3499, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1586401100295-7a8096fd231a?auto=format&fit=crop&q=80&w=800' },
        { name: 'Adjustable Dumbbells Set', price: 8999, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Professional Yoga Mat', price: 1299, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1592432676556-2683e18c8b3d?auto=format&fit=crop&q=80&w=800' },
        { name: 'Resistance Bands Set (5pcs)', price: 999, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1598289411510-291fd1b9ef67?auto=format&fit=crop&q=80&w=800' },
        { name: 'High-Speed Jump Rope', price: 499, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=800' },
        { name: 'Foam Roller (Deep Tissue)', price: 799, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1591129841117-3adfd313e34f?auto=format&fit=crop&q=80&w=800' },
        { name: 'Ab Roller Wheel', price: 699, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Battle Ropes (9m)', price: 4500, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1544216717-3bbf52512659?auto=format&fit=crop&q=80&w=800' },
        { name: 'Medicine Ball 5kg', price: 1899, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Gym Step Board', price: 2199, categoryId: createdCategories[1].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },

        // Apparel
        { name: 'Performance Compression Tee', price: 1299, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=800' },
        { name: 'Quick-Dry Workout Shorts', price: 899, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=800' },
        { name: 'Seamless High-Waist Leggings', price: 1599, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&q=80&w=800' },
        { name: 'Elite Performance Hoodie', price: 2499, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80&w=800' },
        { name: 'Cotton Mix Joggers', price: 1499, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1552066334-971989a44636?auto=format&fit=crop&q=80&w=800' },
        { name: 'Stringer Tank Top', price: 599, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=800' },
        { name: 'Performance Sports Bra', price: 1199, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&q=80&w=800' },
        { name: 'Gym Training Socks (3-pack)', price: 399, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1582967788606-a171c1080cb0?auto=format&fit=crop&q=80&w=800' },
        { name: 'Windbreaker Jacket', price: 2999, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800' },
        { name: 'Breathable Running Shoes', price: 4999, categoryId: createdCategories[2].id, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800' },

        // Accessories
        { name: 'Leather Weightlifting Belt', price: 1899, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1620188467120-090bc1f3078a?auto=format&fit=crop&q=80&w=800' },
        { name: 'Padded Gym Gloves', price: 699, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Liquid Chalk (250ml)', price: 499, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Heavy Duty Wrist Wraps', price: 599, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: '7mm Knee Sleeves (Pair)', price: 2499, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Large Gym Duffel Bag', price: 1799, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=800' },
        { name: 'Shaker Bottle 700ml', price: 349, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1594911772125-07dad7d2fe53?auto=format&fit=crop&q=80&w=800' },
        { name: 'Lifting Straps Set', price: 299, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Ankle Straps for Cables', price: 449, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=800' },
        { name: 'Workout Log Book', price: 249, categoryId: createdCategories[3].id, image: 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?auto=format&fit=crop&q=80&w=800' }
    ];

    console.log(`Inserting ${products.length} products...`);
    for (const p of products) {
        await prisma.storeProduct.create({
            data: {
                name: p.name,
                description: `High-quality ${p.name.toLowerCase()} designed for durability and performance. Perfect for your gym routine.`,
                price: p.price,
                stock: Math.floor(Math.random() * 50) + 10,
                status: 'Active',
                image: p.image,
                tenantId,
                categoryId: p.categoryId,
                sku: `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                category: createdCategories.find(c => c.id === p.categoryId).name
            }
        });
    }

    console.log('Dummy data insertion complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
