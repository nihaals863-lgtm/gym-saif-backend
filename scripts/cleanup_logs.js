const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupExternalLogs() {
  try {
    console.log('Cleaning up external gym records...');
    
    // Delete AccessLogs tagged as VISITOR (unrecognized people)
    const deletedAccess = await prisma.accessLog.deleteMany({
      where: { personType: 'VISITOR' }
    });
    console.log(`Deleted ${deletedAccess.count} unrecognized access logs.`);

    // Delete Attendance where status is 'Denied' (usually from the Denied Stranger flow) 
    // and person isn't found
    const deletedAttendance = await prisma.attendance.deleteMany({
      where: { 
        OR: [
            { status: 'DENIED_STRANGER' },
            { status: 'Denied', checkInMethod: 'biometric' }
        ]
      }
    });
    console.log(`Deleted ${deletedAttendance.count} unrecognized attendance records.`);

    console.log('Cleanup complete!');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupExternalLogs();
