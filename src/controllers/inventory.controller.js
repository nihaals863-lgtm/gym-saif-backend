const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllInventory = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const items = await prisma.inventory.findMany({
            where,
            orderBy: { id: 'desc' }
        });

        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addInventoryItem = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { itemName, category, quantity, unit, minThreshold, status } = req.body;

        const newItem = await prisma.inventory.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                itemName,
                category,
                quantity: parseInt(quantity) || 0,
                unit,
                minThreshold: parseInt(minThreshold) || 5,
                status: status || 'In Stock'
            }
        });

        res.status(201).json(newItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;
        const updateData = req.body;

        if (updateData.quantity) updateData.quantity = parseInt(updateData.quantity);
        if (updateData.minThreshold) updateData.minThreshold = parseInt(updateData.minThreshold);

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        await prisma.inventory.updateMany({
            where,
            data: updateData
        });

        res.json({ message: 'Item updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        await prisma.inventory.deleteMany({
            where
        });

        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.recordUsage = async (req, res) => {
    try {
        const { itemId, quantity, notes } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(itemId) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const item = await prisma.inventory.findFirst({ where });
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const newQuantity = Math.max(0, item.quantity - parseInt(quantity));

        await prisma.inventory.update({
            where: { id: parseInt(itemId) },
            data: {
                quantity: newQuantity,
                status: newQuantity <= item.minThreshold ? 'Low Stock' : 'In Stock'
            }
        });

        res.json({ message: 'Usage recorded successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.receiveStock = async (req, res) => {
    try {
        const { itemId, quantity, unitsReceived, supplier } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(itemId) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const item = await prisma.inventory.findFirst({ where });
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const newQuantity = item.quantity + parseInt(unitsReceived || quantity);

        await prisma.inventory.update({
            where: { id: parseInt(itemId) },
            data: {
                quantity: newQuantity,
                status: newQuantity > item.minThreshold ? 'In Stock' : 'Low Stock'
            }
        });

        res.json({ message: 'Stock received successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
