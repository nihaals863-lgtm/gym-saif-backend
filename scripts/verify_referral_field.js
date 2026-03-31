const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const settings = await prisma.tenantSettings.findFirst();
    console.log('Current Tenant Settings:', JSON.stringify(settings, null, 2));
    
    if (settings && 'referralReward' in settings) {
      console.log('SUCCESS: referralReward field exists in database.');
    } else {
      console.log('FAILURE: referralReward field NOT found in database.');
    }
  } catch (error) {
    console.error('Verification Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
