const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDevices() {
  try {
    const devices = await prisma.device.findMany();
    console.log(JSON.stringify(devices, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkDevices();
