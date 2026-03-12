const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanServiceRequests() {
    try {
        console.log('--- Checking for orphaned ServiceRequests ---');
        
        // Find all service requests
        const allRequests = await prisma.serviceRequest.findMany({
            select: { id: true, memberId: true }
        });
        
        console.log(`Found ${allRequests.length} total service requests.`);
        
        // Find all member IDs
        const allMembers = await prisma.member.findMany({
            select: { id: true }
        });
        const memberIds = new Set(allMembers.map(m => m.id));
        
        const orphaned = allRequests.filter(req => !memberIds.has(req.memberId));
        
        console.log(`Found ${orphaned.length} orphaned service requests.`);
        
        if (orphaned.length > 0) {
            const orphanedIds = orphaned.map(req => req.id);
            console.log(`Deleting orphaned IDs: ${orphanedIds.join(', ')}`);
            
            const deleteResult = await prisma.serviceRequest.deleteMany({
                where: {
                    id: { in: orphanedIds }
                }
            });
            
            console.log(`Deleted ${deleteResult.count} orphaned service requests.`);
        }
        
        console.log('--- Done ---');
    } catch (error) {
        console.error('Error cleaning service requests:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanServiceRequests();
