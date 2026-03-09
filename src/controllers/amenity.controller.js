const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all amenities for a tenant
const getAmenities = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];
        const where = {};

        console.log(`[getAmenities] Request Details:`, {
            email,
            role,
            userTenantId,
            headerTenantId,
            headerType: typeof headerTenantId
        });

        let effectiveHeaderTenantId = headerTenantId;
        if (effectiveHeaderTenantId === 'undefined' || effectiveHeaderTenantId === 'null') {
            effectiveHeaderTenantId = 'all';
        }

        if (role === 'SUPER_ADMIN') {
            if (effectiveHeaderTenantId && effectiveHeaderTenantId !== 'all') {
                const bId = parseInt(effectiveHeaderTenantId);
                if (!isNaN(bId)) {
                    where.tenantId = bId;
                    console.log(`[getAmenities] SUPER_ADMIN filtered by Tenant:`, where.tenantId);
                }
            } else {
                console.log(`[getAmenities] SUPER_ADMIN global view - no filter`);
            }
        } else {
            if (effectiveHeaderTenantId && effectiveHeaderTenantId !== 'all') {
                const bId = parseInt(effectiveHeaderTenantId);
                if (!isNaN(bId)) {
                    where.tenantId = bId;
                    console.log(`[getAmenities] BRANCH_ADMIN/MANAGER filtered by Header Tenant:`, where.tenantId);
                }
            } else {
                // Global view
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userTenantId || -1 },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                const managedBranchIds = branches.map(b => b.id);
                where.tenantId = { in: managedBranchIds };
                console.log(`[getAmenities] BRANCH_ADMIN/MANAGER Global view - Branch IDs:`, managedBranchIds);
            }
        }

        const amenities = await prisma.amenity.findMany({
            where,
            include: {
                tenant: { select: { name: true } }
            },
            orderBy: { name: 'asc' }
        });

        // If in global view, filter to show unique amenities by name
        if ((effectiveHeaderTenantId === 'all' || !effectiveHeaderTenantId) && (role === 'BRANCH_ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN')) {
            const uniqueAmenities = [];
            const seenNames = new Set();
            for (const am of amenities) {
                if (!seenNames.has(am.name)) {
                    uniqueAmenities.push(am);
                    seenNames.add(am.name);
                }
            }
            console.log(`[getAmenities] Returning ${uniqueAmenities.length} unique amenities for global view`);
            return res.json(uniqueAmenities);
        }

        console.log(`[getAmenities] Result - Count: ${amenities.length} found for tenant filter:`, where.tenantId);
        res.json(amenities);
    } catch (error) {
        console.error('[getAmenities] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Add new amenity
const addAmenity = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];
        const { name, description, icon, status, gender } = req.body;

        const isGlobal = !headerTenantId || headerTenantId === 'all' || headerTenantId === 'undefined';

        if (isGlobal) {
            let managedIds = [];
            if (role === 'SUPER_ADMIN') {
                const branches = await prisma.tenant.findMany({ select: { id: true } });
                managedIds = branches.map(b => b.id);
            } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userTenantId || -1 },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                managedIds = branches.map(b => b.id);
            }

            if (managedIds.length === 0) {
                return res.status(403).json({ message: 'No branches found to create amenity' });
            }

            // Create for all found branches
            const creations = managedIds.map(tId =>
                prisma.amenity.create({
                    data: {
                        tenantId: tId,
                        name,
                        description,
                        icon,
                        status: status || 'Active',
                        gender: gender || 'UNISEX'
                    }
                })
            );

            await Promise.all(creations);
            console.log(`[addAmenity] Created amenity "${name}" for ${managedIds.length} branches`);
            return res.status(201).json({ message: `Amenity created for ${managedIds.length} branches` });
        }

        // Single branch creation
        const targetTenantId = parseInt(headerTenantId);

        if (isNaN(targetTenantId)) {
            return res.status(400).json({ message: 'Invalid Branch ID' });
        }

        const amenity = await prisma.amenity.create({
            data: {
                tenantId: targetTenantId,
                name,
                description,
                icon,
                status: status || 'Active',
                gender: gender || 'UNISEX'
            }
        });

        res.status(201).json(amenity);
    } catch (error) {
        console.error('[addAmenity] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Update amenity
const updateAmenity = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];
        const { name, description, icon, status, gender } = req.body;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            const targetTenantId = (headerTenantId && headerTenantId !== 'all') ? parseInt(headerTenantId) : userTenantId;
            where.tenantId = targetTenantId;
        }

        // Check if exists first
        const existing = await prisma.amenity.findFirst({ where });
        if (!existing) {
            return res.status(404).json({ message: 'Amenity not found or access denied' });
        }

        const amenity = await prisma.amenity.update({
            where: { id: parseInt(id) },
            data: { name, description, icon, status, gender }
        });

        res.json({ message: 'Amenity updated successfully', amenity });
    } catch (error) {
        console.error('[updateAmenity] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Delete amenity
const deleteAmenity = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            const targetTenantId = (headerTenantId && headerTenantId !== 'all') ? parseInt(headerTenantId) : userTenantId;
            where.tenantId = targetTenantId;
        }

        const existing = await prisma.amenity.findFirst({ where });
        if (!existing) {
            return res.status(404).json({ message: 'Amenity not found or access denied' });
        }

        await prisma.amenity.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Amenity deleted successfully' });
    } catch (error) {
        console.error('[deleteAmenity] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAmenities,
    addAmenity,
    updateAmenity,
    deleteAmenity
};
