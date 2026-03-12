const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting database cleanup...');

  // 1. Get SuperAdmin credentials
  const superAdmins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' }
  });
  console.log(`Found ${superAdmins.length} SuperAdmins.`);

  // 2. Wipe everything using raw SQL (to bypass foreign key issues easily if needed, 
  // but we'll try to delete in order first or use truncate with foreign key checks off)
  
  // Disable foreign key checks for thorough cleanup
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

  const tables = [
    'attendance', 'booking', 'class', 'invoice_item', 'invoice', 'subscription',
    'followup', 'lead', 'locker', 'inventory', 'equipment', 'maintenancerequest',
    'expense', 'payroll', 'wallet', 'transaction', 'memberprogress', 'announcement',
    'message_template', 'communication_log', 'chat_message', 'notification',
    'reward', 'feedback', 'diet_plan', 'workout_plan', 'store_order_item',
    'store_order', 'store_product', 'store_category', 'amenity', 'coupon',
    'device', 'auditlog', 'webhooklog', 'saassettings', 'saasplan', 'saaspayment',
    'member', 'user', 'tenant', 'expense_category', 'trainer_availability', 'leave_request',
    'pt_session', 'pt_member_account', 'pt_package', 'tenantsettings'
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`Truncated ${table}`);
    } catch (e) {
      console.log(`Failed to truncate ${table}: ${e.message}`);
    }
  }

  // Re-enable foreign key checks
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');

  // 3. Restore SuperAdmins
  for (const sa of superAdmins) {
    await prisma.user.create({
      data: {
        id: sa.id,
        email: sa.email,
        password: sa.password,
        name: sa.name,
        role: sa.role,
        status: sa.status,
        joinedDate: sa.joinedDate
      }
    });
    console.log(`Restored SuperAdmin: ${sa.email}`);
  }

  // 4. Create 2 new Gyms (Tenants)
  const gyms = [
    { name: 'Dummy Gym 1', branchName: 'Branch 1', email: 'admin1@dummy.com' },
    { name: 'Dummy Gym 2', branchName: 'Branch 2', email: 'admin2@dummy.com' }
  ];

  const hashedPassword = await bcrypt.hash('123456', 10);

  for (const gym of gyms) {
    const tenant = await prisma.tenant.create({
      data: {
        name: gym.name,
        branchName: gym.branchName,
        status: 'Active'
      }
    });
    console.log(`Created Tenant: ${gym.name} (ID: ${tenant.id})`);

    const admin = await prisma.user.create({
      data: {
        email: gym.email,
        password: hashedPassword,
        name: `Branch Admin ${gym.name}`,
        role: 'BRANCH_ADMIN',
        tenantId: tenant.id,
        status: 'Active'
      }
    });
    console.log(`Created Branch Admin for ${gym.name}: ${gym.email}`);
  }

  console.log('Database cleanup and reset completed successfully!');
}

main()
  .catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
