const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get Equipment Stats
const getEquipmentStats = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId } = req.query;

        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        } else if (branchId && branchId !== 'all') {
            where.tenantId = parseInt(branchId);
        }

        const [total, operational, inMaintenance, outOfOrder] = await Promise.all([
            prisma.equipment.count({ where }),
            prisma.equipment.count({ where: { ...where, status: 'Operational' } }),
            prisma.equipment.count({ where: { ...where, status: 'In Maintenance' } }),
            prisma.equipment.count({ where: { ...where, status: 'Out of Order' } })
        ]);

        // YTD Maintenance Cost
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const maintenanceCosts = await prisma.maintenanceRequest.aggregate({
            where: {
                equipment: where,
                createdAt: { gte: startOfYear },
                status: 'Completed'
            },
            _sum: {
                cost: true
            }
        });

        res.json({
            total,
            operational,
            inMaintenance,
            outOfOrder,
            ytdCost: Number(maintenanceCosts._sum.cost) || 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all equipment for a tenant
const getAllEquipment = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { search, category, branchId } = req.query;

        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        } else if (branchId && branchId !== 'all') {
            where.tenantId = parseInt(branchId);
        }

        if (category && category !== 'All') {
            where.category = category;
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { serialNumber: { contains: search } },
                { brand: { contains: search } },
                { model: { contains: search } }
            ];
        }

        const equipment = await prisma.equipment.findMany({
            where,
            include: {
                maintenance: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                }
            },
            orderBy: { id: 'desc' }
        });

        res.json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new equipment
const addEquipment = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { name, brand, model, serialNumber, category, location, purchaseDate, purchasePrice, warrantyExpiry, status } = req.body;

        const equipment = await prisma.equipment.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? (req.body.tenantId ? parseInt(req.body.tenantId) : null) : tenantId,
                name,
                brand,
                model,
                serialNumber,
                category,
                location,
                purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
                warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
                status: status || 'Operational'
            }
        });

        res.status(201).json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update equipment
const updateEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;
        const updateData = { ...req.body };

        if (updateData.warrantyExpiry) updateData.warrantyExpiry = new Date(updateData.warrantyExpiry);
        if (updateData.purchaseDate) updateData.purchaseDate = new Date(updateData.purchaseDate);
        if (updateData.purchasePrice) updateData.purchasePrice = parseFloat(updateData.purchasePrice);
        if (updateData.tenantId) delete updateData.tenantId;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const equipment = await prisma.equipment.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete equipment
const deleteEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        // Check if exists and authorized
        const exists = await prisma.equipment.findFirst({ where });
        if (!exists) return res.status(404).json({ message: 'Equipment not found' });

        await prisma.equipment.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Equipment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Report Issue (Maintenance Request)
const reportIssue = async (req, res) => {
    try {
        const { equipmentId, issue, priority, description, cost } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(equipmentId) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const equipment = await prisma.equipment.findFirst({ where });
        if (!equipment) return res.status(404).json({ message: 'Equipment not found' });

        const request = await prisma.maintenanceRequest.create({
            data: {
                equipmentId: parseInt(equipmentId),
                issue,
                description,
                priority: priority || 'Medium',
                cost: cost ? parseFloat(cost) : 0,
                status: 'Pending'
            }
        });

        // Auto-update equipment status if critical
        if (priority === 'High' || priority === 'Critical') {
            await prisma.equipment.update({
                where: { id: parseInt(equipmentId) },
                data: { status: 'Out of Order' }
            });
        } else {
            await prisma.equipment.update({
                where: { id: parseInt(equipmentId) },
                data: { status: 'In Maintenance' }
            });
        }

        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all maintenance requests
const getMaintenanceRequests = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { status, priority, branchId } = req.query;

        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.equipment = { tenantId };
        } else if (branchId && branchId !== 'all') {
            where.equipment = { tenantId: parseInt(branchId) };
        }

        if (status && status !== 'All') where.status = status;
        if (priority) where.priority = priority;

        const requests = await prisma.maintenanceRequest.findMany({
            where,
            include: { equipment: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update Maintenance Status
const updateMaintenanceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cost, completedAt } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.equipment = { tenantId };
        }

        const request = await prisma.maintenanceRequest.findFirst({
            where,
            include: { equipment: true }
        });
        if (!request) return res.status(404).json({ message: 'Maintenance request not found' });

        const updateData = { status };
        if (cost) updateData.cost = parseFloat(cost);
        if (status === 'Completed') {
            updateData.completedAt = completedAt ? new Date(completedAt) : new Date();
        }

        await prisma.maintenanceRequest.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        // If completed, set equipment back to Operational
        if (status === 'Completed') {
            await prisma.equipment.update({
                where: { id: request.equipmentId },
                data: {
                    status: 'Operational',
                    lastService: new Date()
                }
            });
        }

        res.json({ message: 'Maintenance status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getEquipmentStats,
    getAllEquipment,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    reportIssue,
    getMaintenanceRequests,
    updateMaintenanceStatus
};

