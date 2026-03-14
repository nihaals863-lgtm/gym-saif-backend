const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPayrollStatus() {
  try {
    const updated = await prisma.payroll.updateMany({
      where: { status: 'Pending' },
      data: { status: 'Approved' }
    });
    console.log(`Updated ${updated.count} payroll records to 'Approved' status.`);
  } catch (error) {
    console.error('Error updating payroll records:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPayrollStatus();
