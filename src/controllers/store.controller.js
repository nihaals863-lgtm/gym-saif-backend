const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cloudinary = require('../utils/cloudinary');

exports.getProducts = async (req, res) => {
    console.log("[getProducts] Request received");
    try {
        const { category, search, allStatus } = req.query;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        // Read branchId from query OR the x-tenant-id header (set by apiClient interceptor)
        const rawBranchId = req.query.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;
        let where = {};

        const parsedBranchId = branchId ? parseInt(branchId) : NaN;

        if (role === 'SUPER_ADMIN') {
            if (!isNaN(parsedBranchId)) {
                where.tenantId = parsedBranchId;
            }
        } else {
            if (!isNaN(parsedBranchId)) {
                where.tenantId = parsedBranchId;
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (allStatus !== 'true') {
            where.status = { not: 'Inactive' };
        }

        if (category && category !== 'All') {
            where.category = category;
        }

        if (search) {
            where.name = { contains: search };
        }

        console.log(`[getProducts] role=${role}, branchId=${branchId}, where=`, JSON.stringify(where));

        const products = await prisma.storeProduct.findMany({
            where,
            include: { tenant: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });

        console.log(`[getProducts] Found ${products.length} products`);
        res.json(products);
    } catch (error) {
        console.error("[getProducts] Fatal error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getStoreStats = async (req, res) => {
    console.log("[getStoreStats] Request received");
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        // Read branchId from query OR the x-tenant-id header
        const rawBranchId = req.query.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;

        let targetTenantIds = [];
        const parsedBranchId = branchId ? parseInt(branchId) : NaN;

        if (role === 'SUPER_ADMIN') {
            if (!isNaN(parsedBranchId)) {
                targetTenantIds = [parsedBranchId];
            } else {
                const branches = await prisma.tenant.findMany({ select: { id: true } });
                targetTenantIds = branches.map(b => b.id);
            }
        } else {
            if (!isNaN(parsedBranchId)) {
                targetTenantIds = [parsedBranchId];
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                targetTenantIds = branches.map(b => b.id);
            }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

        const [products, orders, categoriesCount] = await Promise.all([
            prisma.storeProduct.findMany({ where: { tenantId: { in: targetTenantIds } } }),
            prisma.storeOrder.findMany({
                where: { tenantId: { in: targetTenantIds } },
                include: { items: { include: { product: true } }, member: true },
                orderBy: { date: 'desc' }
            }),
            prisma.storeCategory.count({ where: { tenantId: { in: targetTenantIds } } })
        ]);

        const totalProducts = products.length;
        const lowStockCount = products.filter(p => p.stock < 10).length;
        const stockValue = products.reduce((acc, p) => acc + (parseFloat(p.price) * p.stock), 0);

        // --- Current Period Metrics ---
        const todayOrders = orders.filter(o => new Date(o.createdAt || o.date) >= today);
        const todayPos = todayOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);

        const thisMonthOrders = orders.filter(o => new Date(o.createdAt || o.date) >= monthStart);
        const totalRevenue = orders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
        const totalSales = orders.length;

        // --- Profit Calculation ---
        const calculateProfit = (orderList) => {
            let profit = 0;
            orderList.forEach(order => {
                order.items.forEach(item => {
                    const cost = parseFloat(item.product?.costPrice || 0);
                    const price = parseFloat(item.priceAtBuy || item.product?.price || 0);
                    profit += (price - cost) * item.quantity;
                });
            });
            return profit;
        };

        const totalProfitFiltered = calculateProfit(orders);
        const thisMonthProfit = calculateProfit(thisMonthOrders);

        // --- Trend Calculations ---

        // POS Trend (Today vs Yesterday)
        const yesterdayOrders = orders.filter(o => {
            const d = new Date(o.createdAt || o.date);
            return d >= yesterday && d < today;
        });
        const yesterdayPos = yesterdayOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
        let posTrend = { value: "0% vs yesterday", direction: "stable" };
        if (yesterdayPos > 0) {
            const diff = ((todayPos - yesterdayPos) / yesterdayPos) * 100;
            posTrend = {
                value: `${diff >= 0 ? '+' : ''}${Math.round(diff)}% vs yesterday`,
                direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable'
            };
        } else if (todayPos > 0) {
            posTrend = { value: `+₹${todayPos.toLocaleString()} today`, direction: 'up' };
        }

        // Monthly Trends (Current Month vs Last Month)
        const lastMonthOrders = orders.filter(o => {
            const d = new Date(o.createdAt || o.date);
            return d >= lastMonthStart && d <= lastMonthEnd;
        });

        const lastMonthRevenue = lastMonthOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
        const lastMonthProfit = calculateProfit(lastMonthOrders);
        const lastMonthSalesCount = lastMonthOrders.length;

        const getTrend = (current, previous, label = "vs last month") => {
            if (previous === 0) {
                return current > 0 ? { value: `New growth`, direction: 'up' } : { value: "No change", direction: 'stable' };
            }
            const diff = ((current - previous) / previous) * 100;
            return {
                value: `${diff >= 0 ? '+' : ''}${Math.round(diff)}% ${label}`,
                direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable'
            };
        };

        const revenueTrend = getTrend(totalRevenue - lastMonthRevenue, lastMonthRevenue); // Comparing this month's contribution vs last month is tricky since totalRevenue is cumulative. Let's compare Month-to-Month.

        // Better: Compare THIS MONTH vs LAST MONTH
        const thisMonthRevenue = thisMonthOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
        const thisMonthSalesCount = thisMonthOrders.length;

        res.json({
            stats: {
                totalSales,
                productsCount: totalProducts,
                todayPos,
                totalRevenue,
                profit: totalProfitFiltered,
                stockValue,
                lowStockCount,
                categoriesCount,
                pendingOrders: orders.filter(o => o.status === 'Pending').length,
                todaySalesCount: todayOrders.length,
                // Trends
                posTrend: posTrend,
                revenueTrend: getTrend(thisMonthRevenue, lastMonthRevenue),
                salesTrend: getTrend(thisMonthSalesCount, lastMonthSalesCount),
                profitTrend: getTrend(thisMonthProfit, lastMonthProfit)
            },
            recentTransactions: orders.slice(0, 5).map(o => ({
                id: o.id.toString(),
                amount: o.total,
                status: o.status,
                itemsCount: o.itemsCount,
                date: o.date || o.createdAt
            })),
            orders: orders.slice(0, 10).map(o => ({
                ...o,
                totalAmount: o.total // convenience for frontend
            }))
        });
    } catch (error) {
        console.error("[getStoreStats] Fatal error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.addProduct = async (req, res) => {
    try {
        const { name, sku, category, price, stock, description, image, originalPrice, branchId, costPrice, taxRate } = req.body;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;

        console.log(`[addProduct] branchId from body: ${branchId}, userTenantId: ${userTenantId}, role: ${role}`);

        let targetTenantIds = [];

        if (branchId === 'all') {
            let branchQuery = {};
            if (role !== 'SUPER_ADMIN') {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });
                branchQuery.where = { OR: orConditions };
            }
            const branches = await prisma.tenant.findMany(branchQuery);
            targetTenantIds = branches.map(b => b.id);
        } else if (branchId) {
            targetTenantIds = [parseInt(branchId)];
        } else {
            targetTenantIds = [userTenantId];
        }

        // calculate status based on stock
        let status = 'Active';
        if (parseInt(stock) === 0) status = 'Inactive';
        else if (parseInt(stock) <= 10) status = 'Low Stock';

        // upload image if it's base64
        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/products'
            });
            imageUrl = uploadRes.secure_url;
        }

        const products = await Promise.all(targetTenantIds.map(tId =>
            prisma.storeProduct.create({
                data: {
                    tenantId: tId,
                    name,
                    sku,
                    category,
                    price: parseFloat(price),
                    costPrice: costPrice ? parseFloat(costPrice) : null,
                    taxRate: taxRate ? parseFloat(taxRate) : 0,
                    stock: parseInt(stock),
                    status,
                    description,
                    image: imageUrl,
                    originalPrice: originalPrice ? parseFloat(originalPrice) : null,
                }
            })
        ));

        res.status(201).json(products[0]);
    } catch (error) {
        console.error("Create product error:", error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: `A product with SKU "${req.body.sku}" already exists. Please use a unique SKU.` });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock } = req.body;

        const status = parseInt(stock) === 0 ? 'Inactive' : (parseInt(stock) <= 10 ? 'Low Stock' : 'Active');

        const updatedProduct = await prisma.storeProduct.update({
            where: { id: parseInt(id) },
            data: {
                stock: parseInt(stock),
                status
            }
        });

        res.json(updatedProduct);
    } catch (error) {
        console.error("Update stock error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, sku, category, price, stock, description, image, originalPrice, status, costPrice, taxRate } = req.body;

        // Auto calculate status if stock updated and status is not explicitly set to something else
        let calculatedStatus = status || 'Active';
        if (parseInt(stock) === 0) calculatedStatus = 'Inactive';
        else if (parseInt(stock) <= 10 && calculatedStatus !== 'Inactive') calculatedStatus = 'Low Stock';

        // upload image if it's base64
        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/products'
            });
            imageUrl = uploadRes.secure_url;
        }

        const product = await prisma.storeProduct.update({
            where: { id: parseInt(id) },
            data: {
                name,
                sku,
                category,
                price: parseFloat(price),
                costPrice: costPrice ? parseFloat(costPrice) : null,
                taxRate: taxRate ? parseFloat(taxRate) : 0,
                stock: parseInt(stock),
                status: calculatedStatus,
                description,
                image: imageUrl,
                originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            }
        });

        res.json(product);
    } catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const product = await prisma.storeProduct.findUnique({ where: { id: parseInt(id) } });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        if (role !== 'SUPER_ADMIN' && product.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: product.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this product' });
        }

        await prisma.storeProduct.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error("Delete product error:", error);
        res.status(500).json({ message: error.message });
    }
};

const fs = require('fs');
const path = require('path');

exports.checkout = async (req, res) => {
    try {
        const { tenantId: reqTenantId, role } = req.user;
        let { memberId, items, total, guestInfo, tenantId: bodyTenantId, paymentMode, referenceNumber, cartItems, totalAmount } = req.body;
        
        // Normalize payload: Support both POS.jsx and StorePage.jsx formats
        if (!items && cartItems) items = cartItems;
        if (!total && totalAmount) total = totalAmount;
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ message: 'Cart items are required and must be an array' });
        }
        
        // Normalize items: Map 'id' to 'productId' if necessary
        const normalizedItems = items.map(item => ({
            productId: item.productId || item.id,
            quantity: item.quantity,
            price: item.price
        }));

        const itemsToProcess = normalizedItems;

        const order = await prisma.$transaction(async (tx) => {
            let actualMemberId = null;
            let actualTenantId = reqTenantId || 1;

            // Allow Super Admin or Branch Admin/Manager to checkout on behalf of a specific branch
            if (['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'].includes(role) && bodyTenantId) {
                actualTenantId = parseInt(bodyTenantId);
            }

            if (role === 'MEMBER') {
                const memberRaw = await tx.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
                const member = memberRaw[0];
                if (!member) throw new Error("Member not found");
                actualMemberId = member.id;
                actualTenantId = member.tenantId;
            } else if (memberId) {
                actualMemberId = parseInt(memberId);
            }

            let finalTotal = 0;
            let itemsCount = 0;
            const orderItemsInput = [];

            for (const item of itemsToProcess) {
                const product = await tx.storeProduct.findUnique({ where: { id: parseInt(item.productId) } });
                if (!product) throw new Error(`Product ${item.productId} not found`);
                if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

                await tx.storeProduct.update({
                    where: { id: product.id },
                    data: {
                        stock: product.stock - item.quantity,
                        status: (product.stock - item.quantity) === 0 ? 'Inactive' : ((product.stock - item.quantity) <= 10 ? 'Low Stock' : 'Active')
                    }
                });

                finalTotal += parseFloat(product.price) * parseInt(item.quantity);
                itemsCount += parseInt(item.quantity);

                orderItemsInput.push({
                    productId: product.id,
                    quantity: item.quantity,
                    priceAtBuy: product.price
                });
            }

            const newOrder = await tx.storeOrder.create({
                data: {
                    tenantId: actualTenantId,
                    memberId: actualMemberId,
                    guestName: guestInfo?.name,
                    guestPhone: guestInfo?.phone,
                    guestEmail: guestInfo?.email,
                    itemsCount,
                    total: finalTotal,
                    paymentMode: paymentMode || 'Cash',
                    referenceNumber: referenceNumber || null,
                    status: 'Completed',
                    items: {
                        create: orderItemsInput
                    }
                },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            });

            // Create an actual Invoice record for financial tracking
            const invoiceItems = [];
            for (const item of newOrder.items) {
                invoiceItems.push({
                    description: item.product?.name || `Product #${item.productId}`,
                    quantity: item.quantity,
                    rate: item.priceAtBuy,
                    amount: parseFloat(item.quantity) * parseFloat(item.priceAtBuy)
                });
            }

            const invoice = await tx.invoice.create({
                data: {
                    tenantId: actualTenantId,
                    invoiceNumber: `POS-${Date.now()}`,
                    memberId: actualMemberId,
                    amount: finalTotal,
                    status: 'Paid',
                    dueDate: new Date(),
                    paidDate: new Date(),
                    paymentMode: paymentMode || 'Cash',
                    notes: referenceNumber ? `POS Order #${newOrder.id} [Ref: ${referenceNumber}]` : `POS Order #${newOrder.id}`,
                    items: {
                        create: invoiceItems
                    }
                }
            });

            return { ...newOrder, invoice };
        });

        res.status(201).json(order);
    } catch (error) {
        console.error("Store checkout error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const rawBranchId = req.query.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;

        let where = {};

        if (role === 'MEMBER') {
            const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            const member = memberRaw[0];
            if (!member) return res.status(404).json({ message: 'Member profile not found' });
            where.memberId = member.id;
        } else if (role === 'SUPER_ADMIN') {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            } else {
                where.tenantId = userTenantId;
            }
        }

        const orders = await prisma.storeOrder.findMany({
            where,
            include: {
                member: { select: { name: true } },
                items: {
                    include: {
                        product: true
                    }
                }
            },
            orderBy: { date: 'desc' }
        });

        const formatted = orders.map(o => ({
            id: o.id,
            totalAmount: parseFloat(o.total || 0),
            total: parseFloat(o.total || 0),
            itemsCount: o.items ? o.items.length : (o.itemsCount || 0),
            status: o.status,
            createdAt: o.date || o.createdAt,
            date: o.date || o.createdAt,
            member: o.member,
            memberName: o.member?.name || null,
            guestName: o.guestName || null,
            guestPhone: o.guestPhone || null,
            guestEmail: o.guestEmail || null,
            tenantId: o.tenantId,
            items: (o.items || []).map(item => ({
                id: item.id,
                productName: item.product?.name || 'Unknown Product',
                quantity: item.quantity,
                price: parseFloat(item.priceAtBuy || item.product?.price || 0),
                total: parseFloat(item.priceAtBuy || item.product?.price || 0) * item.quantity
            }))
        }));

        res.json(formatted);
    } catch (error) {
        console.error("Store orders error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.storeOrder.findUnique({
            where: { id: parseInt(id) },
            include: {
                member: true,
                tenant: { select: { name: true } },
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });

        if (!order) return res.status(404).json({ message: 'Order not found' });

        const formatted = {
            id: order.id,
            invoiceNumber: `ORD-${order.id}`,
            member: order.member,
            tenant: order.tenant,
            amount: Number(order.total?.toString() || 0),
            total: Number(order.total?.toString() || 0),
            paymentMode: order.paymentMode || 'Cash',
            status: order.status === 'Completed' || order.status === 'Processing' ? 'Paid' : order.status,
            paidDate: order.date || order.createdAt,
            dueDate: order.date || order.createdAt,
            items: (order.items || []).map(item => {
                const rate = Number(item.priceAtBuy?.toString() || item.product?.price?.toString() || 0);
                return {
                    description: item.product?.name || 'Unknown Product',
                    quantity: Number(item.quantity || 0),
                    rate: rate,
                    amount: rate * Number(item.quantity || 0)
                };
            })
        };

        res.json(formatted);
    } catch (error) {
        console.error("Get order by id error:", error);
        res.status(500).json({ message: error.message });
    }
};

// Coupons
exports.getCoupons = async (req, res) => {
    try {
        const { status, search } = req.query;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const rawBranchId = req.query.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;
        let where = {};

        if (role === 'SUPER_ADMIN') {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (status && status !== 'All Status') {
            if (status === 'Expired') {
                where.OR = [
                    { status: 'Expired' },
                    { endDate: { lt: new Date() } }
                ];
            } else {
                where.status = status;
            }
        }

        if (search) {
            where.code = { contains: search };
        }

        const coupons = await prisma.coupon.findMany({
            where,
            include: { tenant: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });

        res.json(coupons);
    } catch (error) {
        console.error("Get coupons error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getCouponStats = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const rawBranchId = req.query.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;
        let where = {};

        if (role === 'SUPER_ADMIN') {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId) {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const totalCoupons = await prisma.coupon.count({ where });
        const activeCoupons = await prisma.coupon.count({ where: { ...where, status: 'Active' } });
        const expiredCoupons = await prisma.coupon.count({
            where: {
                ...where,
                OR: [
                    { status: 'Expired' },
                    { endDate: { lt: new Date() } }
                ]
            }
        });

        const redemptions = await prisma.coupon.aggregate({
            where,
            _sum: {
                usedCount: true
            }
        });

        res.json({
            totalCoupons,
            activeCoupons,
            expiredCoupons,
            totalRedemptions: redemptions._sum.usedCount || 0
        });
    } catch (error) {
        console.error("Get coupon stats error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const { code, description, type, value, minPurchase, maxUses, startDate, endDate, status } = req.body;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const rawBranchId = req.body.branchId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'undefined' ? rawBranchId : null;

        let targetTenantIds = [];

        if (branchId === 'all') {
            let branchQuery = {};
            if (role !== 'SUPER_ADMIN') {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });
                branchQuery.where = { OR: orConditions };
            }
            const branches = await prisma.tenant.findMany(branchQuery);
            targetTenantIds = branches.map(b => b.id);
        } else if (branchId) {
            targetTenantIds = [parseInt(branchId)];
        } else {
            targetTenantIds = [userTenantId];
        }

        const coupons = await Promise.all(targetTenantIds.map(tId =>
            prisma.coupon.create({
                data: {
                    tenantId: tId,
                    code,
                    description,
                    type,
                    value: parseFloat(value),
                    minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
                    maxUses: maxUses ? parseInt(maxUses) : 0,
                    startDate: startDate ? new Date(startDate) : new Date(),
                    endDate: endDate ? new Date(endDate) : null,
                    status: status || 'Active',
                }
            })
        ));

        res.status(201).json(coupons[0]);
    } catch (error) {
        console.error("Create coupon error:", error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: `A coupon with code "${req.body.code}" already exists. Please use a unique code.` });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, description, type, value, minPurchase, maxUses, startDate, endDate, status } = req.body;
        const rawBranchId = req.body.tenantId || req.headers['x-tenant-id'];
        const branchId = rawBranchId && rawBranchId !== 'all' && rawBranchId !== 'undefined' ? rawBranchId : null;

        const coupon = await prisma.coupon.update({
            where: { id: parseInt(id) },
            data: {
                code,
                description,
                type,
                value: value ? parseFloat(value) : undefined,
                minPurchase: minPurchase !== undefined ? parseFloat(minPurchase) : undefined,
                maxUses: maxUses !== undefined ? parseInt(maxUses) : undefined,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : null,
                status,
                tenantId: branchId ? parseInt(branchId) : undefined,
            }
        });

        res.json(coupon);
    } catch (error) {
        console.error("Update coupon error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const coupon = await prisma.coupon.findUnique({ where: { id: parseInt(id) } });
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

        if (role !== 'SUPER_ADMIN' && coupon.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: coupon.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this coupon' });
        }

        await prisma.coupon.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        console.error("Delete coupon error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const { search, branchId } = req.query;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        let where = {};

        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (search) {
            where.name = { contains: search };
        }

        const categories = await prisma.storeCategory.findMany({
            where,
            include: { tenant: { select: { name: true } } },
            orderBy: { sortOrder: 'asc' },
        });

        res.json(categories);
    } catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const { name, description, image, sortOrder, status, branchId } = req.body;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;

        let targetTenantIds = [];

        if (branchId === 'all') {
            let branchQuery = {};
            if (role !== 'SUPER_ADMIN') {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });
                branchQuery.where = { OR: orConditions };
            }
            const branches = await prisma.tenant.findMany(branchQuery);
            targetTenantIds = branches.map(b => b.id);
        } else if (branchId) {
            targetTenantIds = [parseInt(branchId)];
        } else {
            targetTenantIds = [userTenantId];
        }

        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/categories'
            });
            imageUrl = uploadRes.secure_url;
        }

        const categories = await Promise.all(targetTenantIds.map(tId =>
            prisma.storeCategory.create({
                data: {
                    tenantId: tId,
                    name,
                    description,
                    image: imageUrl,
                    sortOrder: parseInt(sortOrder) || 0,
                    status: status || 'Active',
                }
            })
        ));

        res.status(201).json(categories[0]);
    } catch (error) {
        console.error("Create category error:", error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: `A category with the name "${req.body.name}" already exists for this branch.` });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, image, sortOrder, status } = req.body;

        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/categories'
            });
            imageUrl = uploadRes.secure_url;
        }

        const category = await prisma.storeCategory.update({
            where: { id: parseInt(id) },
            data: {
                name,
                description,
                image: imageUrl,
                sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : undefined,
                status,
            }
        });

        res.json(category);
    } catch (error) {
        console.error("Update category error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.storeCategory.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error("Delete category error:", error);
        res.status(500).json({ message: error.message });
    }
};
