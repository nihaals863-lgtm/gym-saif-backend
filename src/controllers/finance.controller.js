const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all expenses
const getExpenses = async (req, res) => {
    try {
        const { branchId: qBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { tenantId: userTenantId, role, email, name: userName } = req.user;

        const branchId = qBranchId || headerTenantId;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: { OR: [{ id: userTenantId }, { owner: email }, { owner: userName }] },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const expenses = await prisma.expense.findMany({
            where,
            include: { tenant: { select: { name: true } } },
            orderBy: { date: 'desc' }
        });

        res.status(200).json(expenses);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: 'Failed to fetch expenses' });
    }
};

// Add new expense
const createExpense = async (req, res) => {
    try {
        const { title, category, amount, date, notes, status, branchId } = req.body;
        const { tenantId, role } = req.user;

        let targetTenantId = tenantId;
        if ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN') && branchId && branchId !== 'all') {
            targetTenantId = parseInt(branchId);
        }

        if (!targetTenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID is required for creating an expense' });
        }

        const newExpense = await prisma.expense.create({
            data: {
                tenantId: targetTenantId || 1,
                title,
                category,
                amount: parseFloat(amount),
                date: new Date(date),
                status: status || 'Pending',
                notes: notes || null,
                addedBy: req.user.name || 'Admin',
            }
        });

        res.status(201).json(newExpense);
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ message: 'Failed to add expense' });
    }
};

// Get all invoices with stats
const getInvoices = async (req, res) => {
    try {
        const { branchId: qBranchId, status: statusFilter, search } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { role, tenantId: userTenantId, email, name: userName } = req.user;

        const branchId = qBranchId || headerTenantId;

        let branchWhere = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                branchWhere.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                branchWhere.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: { OR: [{ id: userTenantId }, { owner: email }, { owner: userName }] },
                    select: { id: true }
                });
                branchWhere.tenantId = { in: branches.map(b => b.id) };
            }
        }

        let listWhere = { ...branchWhere };

        if (statusFilter && statusFilter !== 'All Status') {
            listWhere.status = statusFilter;
        }

        if (search) {
            listWhere.OR = [
                { invoiceNumber: { contains: search } },
                { member: { name: { contains: search } } },
                { guestName: { contains: search } }
            ];
        }

        let storeWhere = { ...listWhere };
        if (statusFilter === 'Paid') {
            storeWhere.status = 'Completed';
        } else if (statusFilter === 'Unpaid') {
            storeWhere.status = 'Processing';
        }

        const [invoices, allInvoices, storeOrdersFull, allStoreOrders] = await Promise.all([
            prisma.invoice.findMany({
                where: listWhere,
                include: { member: true, items: true, tenant: { select: { name: true } } },
                orderBy: { dueDate: 'desc' }
            }),
            prisma.invoice.findMany({
                where: branchWhere,
                select: { id: true, amount: true, status: true, memberId: true }
            }),
            prisma.storeOrder.findMany({
                where: storeWhere,
                include: { member: true, items: { include: { product: true } }, tenant: { select: { name: true } } },
                orderBy: { date: 'desc' }
            }),
            prisma.storeOrder.findMany({
                where: branchWhere,
                select: { id: true, total: true, status: true, memberId: true }
            })
        ]);

        const mappedPOS = storeOrdersFull.map(order => ({
            id: `pos-${order.id}`,
            internalId: order.id,
            type: 'POS Sale',
            invoiceNumber: `POS-#${order.id}`,
            amount: order.total,
            status: order.status === 'Completed' || order.status === 'Processing' ? 'Paid' : 'Unpaid',
            dueDate: order.date,
            paidDate: order.date,
            member: order.member || { name: order.guestName || 'Walk-in Guest', memberId: 'GUEST' },
            tenant: order.tenant,
            items: order.items.map(i => ({
                description: i.product?.name || 'Store Product',
                quantity: i.quantity,
                rate: i.priceAtBuy,
                amount: Number(i.quantity) * Number(i.priceAtBuy)
            })),
            paymentMode: order.paymentMode
        }));

        const combinedInvoices = [...invoices, ...mappedPOS].sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

        const uniqueInvoicingClients = new Set(allInvoices.filter(i => i.memberId).map(i => i.memberId));
        const uniqueStoreClients = new Set(allStoreOrders.filter(o => o.memberId).map(o => o.memberId));
        const combinedClients = new Set([...uniqueInvoicingClients, ...uniqueStoreClients]).size;

        const totalPaidInvoices = allInvoices.filter(i => i.status === 'Paid').reduce((acc, i) => acc + Number(i.amount), 0);
        const totalPaidStore = allStoreOrders.filter(o => o.status === 'Paid' || o.status === 'Processing').reduce((acc, o) => acc + Number(o.total), 0);

        const totalUnpaidInvoices = allInvoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + Number(i.amount), 0);
        const totalUnpaidStore = allStoreOrders.filter(o => o.status !== 'Paid' && o.status !== 'Processing').reduce((acc, o) => acc + Number(o.total), 0);

        res.status(200).json({
            invoices: combinedInvoices,
            stats: {
                clients: combinedClients,
                totalInvoices: allInvoices.length + allStoreOrders.length,
                paid: totalPaidInvoices + totalPaidStore,
                unpaid: totalUnpaidInvoices + totalUnpaidStore
            }
        });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices' });
    }
};

const createInvoice = async (req, res) => {
    try {
        const { memberId, dueDate, items, discount, taxRate, notes, status, branchId } = req.body;
        const { tenantId, role } = req.user;

        let targetTenantId = tenantId;
        if ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN') && branchId && branchId !== 'all') {
            targetTenantId = parseInt(branchId);
        }

        const subtotal = items.reduce((acc, item) => acc + (parseFloat(item.rate) * parseInt(item.quantity)), 0);
        const disc = parseFloat(discount) || 0;
        const rate = parseFloat(taxRate) || 0;
        const taxAmount = (subtotal - disc) * (rate / 100);
        const totalAmount = subtotal - disc + taxAmount;

        const newInvoice = await prisma.invoice.create({
            data: {
                tenantId: targetTenantId || 1,
                invoiceNumber: `INV-${Date.now()}`,
                memberId: memberId ? parseInt(memberId) : null,
                subtotal,
                taxRate: rate,
                taxAmount,
                discount: disc,
                amount: totalAmount,
                status: status || 'Unpaid',
                dueDate: new Date(dueDate),
                notes: notes || null,
                items: {
                    create: items.map(item => ({
                        description: item.description,
                        quantity: parseInt(item.quantity),
                        rate: parseFloat(item.rate),
                        amount: parseFloat(item.rate) * parseInt(item.quantity)
                    }))
                }
            },
            include: { items: true, member: true }
        });

        res.status(201).json(newInvoice);
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ message: error.message });
    }
};

// Receive Payment via Cashier Mode
const receivePayment = async (req, res) => {
    try {
        const { memberId, paymentType, amount, discount, method, referenceNumber, notes } = req.body;
        const tenantId = req.user.tenantId;

        if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID is required for logging a payment' });
        }

        // Calculate final amount after discount
        const baseAmount = parseFloat(amount) || 0;
        const disc = parseFloat(discount) || 0;
        const finalAmount = Math.max(0, baseAmount - disc);

        // Create an Invoice as the transaction record
        const newInvoice = await prisma.invoice.create({
            data: {
                tenantId: tenantId || 1,
                invoiceNumber: `RCPT-${Math.floor(100000 + Math.random() * 900000)}`,
                memberId: parseInt(memberId),
                amount: finalAmount,
                paymentMode: method || 'Cash',
                status: 'Paid',
                dueDate: new Date(),
                paidDate: new Date(),
                notes: referenceNumber ? `[Ref: ${referenceNumber}] ${notes || ''}`.trim() : (notes || null)
            },
            include: { member: true }
        });

        res.status(201).json({
            message: 'Payment received successfully',
            receipt: newInvoice
        });
    } catch (error) {
        console.error('Error receiving payment:', error);
        res.status(500).json({ message: 'Failed to process payment' });
    }
};

// Settle an existing unpaid invoice (Support both Invoices and POS Orders)
const settleInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { method, referenceNumber, amount, date } = req.body;
        const { tenantId, role } = req.user;

        console.log(`[settleInvoice] ID: ${id}, Method: ${method}`);

        // Handle POS Sales (id starts with pos-)
        if (id.startsWith('pos-')) {
            const internalId = parseInt(id.replace('pos-', ''));
            const order = await prisma.storeOrder.findUnique({
                where: { id: internalId }
            });

            if (!order) return res.status(404).json({ message: 'POS Order not found' });

            // Authorization check
            if (role !== 'SUPER_ADMIN' && order.tenantId !== tenantId) {
                const isOwner = await prisma.tenant.findFirst({
                    where: { id: order.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
                });
                if (!isOwner) {
                    return res.status(403).json({ message: 'Not authorized to update this order' });
                }
            }

            const updatedOrder = await prisma.storeOrder.update({
                where: { id: internalId },
                data: {
                    paymentMode: method || 'Cash',
                    referenceNumber: referenceNumber || null,
                    status: 'Completed', // Setting status to Completed makes it "Paid" in finance views
                    date: date ? new Date(date) : new Date()
                }
            });

            return res.json({
                message: 'POS Order settled successfully',
                invoice: { ...updatedOrder, id: `pos-${updatedOrder.id}` }
            });
        }

        // Handle Membership Invoices
        const invoiceId = parseInt(id);
        if (isNaN(invoiceId)) return res.status(400).json({ message: 'Invalid Invoice ID' });

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId }
        });

        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        // Authorization check
        if (role !== 'SUPER_ADMIN' && invoice.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: invoice.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
            });
            if (!isOwner) {
                return res.status(403).json({ message: 'Not authorized to update this invoice' });
            }
        }

        // Store reference number in notes since Invoice model doesn't have a dedicated referenceNumber field yet
        const updatedNotes = referenceNumber
            ? `${invoice.notes || ''}\n[Payment Ref: ${referenceNumber}]`.trim()
            : invoice.notes;

        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                paymentMode: method || 'Cash',
                status: 'Paid',
                paidDate: date ? new Date(date) : new Date(),
                notes: updatedNotes
            }
        });

        res.json({
            message: 'Invoice settled successfully',
            invoice: updatedInvoice
        });
    } catch (error) {
        console.error('Error settling invoice:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get all transactions
const getTransactions = async (req, res) => {
    try {
        const { branchId: qBranchId, search, startDate, endDate, method, status } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { role, tenantId: userTenantId, email, name: userName } = req.user;

        const branchId = qBranchId || headerTenantId;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: { OR: [{ id: userTenantId }, { owner: email }, { owner: userName }] },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (status && status !== 'All Status') {
            where.status = status;
        }

        if (method && method !== 'All Methods') {
            where.paymentMode = method;
        }

        if (startDate || endDate) {
            where.paidDate = {};
            if (startDate) where.paidDate.gte = new Date(startDate);
            if (endDate) where.paidDate.lte = new Date(endDate);
        }

        if (search) {
            where.OR = [
                { invoiceNumber: { contains: search } },
                { member: { name: { contains: search } } }
            ];
        }

        const storeWhere = {
            tenantId: where.tenantId,
            status: status && status !== 'All Status' ? status : undefined,
            paymentMode: method && method !== 'All Methods' ? method : undefined,
            date: where.paidDate
        };

        if (search) {
            storeWhere.OR = [
                { guestName: { contains: search } },
                { member: { name: { contains: search } } }
            ];
        }

        const [invoices, storeOrders] = await Promise.all([
            prisma.invoice.findMany({
                where,
                include: { member: true, tenant: { select: { name: true } } },
                orderBy: { paidDate: 'desc' }
            }),
            prisma.storeOrder.findMany({
                where: storeWhere,
                include: { member: true, tenant: { select: { name: true } } },
                orderBy: { date: 'desc' }
            })
        ]);

        const formattedInvoices = invoices.map(inv => ({
            id: inv.invoiceNumber,
            internalId: inv.id,
            member: inv.member ? inv.member.name : 'Unknown',
            type: 'Membership',
            method: inv.paymentMode || 'Cash',
            amount: Number(inv.amount),
            date: inv.paidDate || inv.dueDate,
            status: inv.status,
            branch: inv.tenant?.name || 'Main Branch',
            flow: 'in'
        }));

        const formattedPOS = storeOrders.map(o => ({
            id: `ORD-${o.id}`,
            internalId: o.id,
            member: o.member ? o.member.name : (o.guestName || 'Guest'),
            type: 'POS Sale',
            method: o.paymentMode || 'POS',
            amount: Number(o.total),
            date: o.date,
            status: o.status,
            branch: o.tenant?.name || 'Main Branch',
            flow: 'in'
        }));

        const allTransactions = [...formattedInvoices, ...formattedPOS].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Stats Calculation
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayCollection = allTransactions
            .filter(t => t.status === 'Paid' && new Date(t.date) >= today)
            .reduce((acc, t) => acc + t.amount, 0);

        const filteredTotal = allTransactions.reduce((acc, t) => acc + t.amount, 0);
        const completed = allTransactions.filter(t => t.status === 'Paid').reduce((acc, t) => acc + t.amount, 0);
        const pending = allTransactions.filter(t => t.status !== 'Paid').reduce((acc, t) => acc + t.amount, 0);

        res.json({
            transactions: allTransactions,
            stats: { todayCollection, filteredTotal, completed, pending }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Failed to fetch transactions' });
    }
};

const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;

        const expense = await prisma.expense.findUnique({
            where: { id: parseInt(id) }
        });

        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        if (req.user.role !== 'SUPER_ADMIN' && expense.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: expense.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
            });
            if (!isOwner) {
                return res.status(403).json({ message: 'Not authorized to delete this expense' });
            }
        }

        await prisma.expense.delete({
            where: { id: parseInt(id) }
        });

        res.status(200).json({ message: 'Expense deleted successfully' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ message: 'Failed to delete expense' });
    }
};

const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(id) },
            include: { member: true, items: true, tenant: { select: { name: true } } }
        });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId: userTenantId } = req.user;

        const invoice = await prisma.invoice.findUnique({ where: { id: parseInt(id) } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        if (role !== 'SUPER_ADMIN' && invoice.tenantId !== userTenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: invoice.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
            });
            if (!isOwner) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }

        // Delete line items first
        await prisma.invoiceItem.deleteMany({ where: { invoiceId: parseInt(id) } });
        await prisma.invoice.delete({ where: { id: parseInt(id) } });

        res.json({ message: 'Invoice deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getFinanceStats = async (req, res) => {
    try {
        const { branchId: qBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { role, tenantId: userTenantId, email, name: userName } = req.user;

        const branchId = qBranchId || headerTenantId;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                const branches = await prisma.tenant.findMany({
                    where: { OR: [{ id: userTenantId }, { owner: email }, { owner: userName }] },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        // Fetch all data for the calculated where clause
        const [invoices, expenses, storeOrders] = await Promise.all([
            prisma.invoice.findMany({
                where,
                include: { member: true, tenant: { select: { name: true } } },
                orderBy: { dueDate: 'desc' }
            }),
            prisma.expense.findMany({
                where,
                include: { tenant: { select: { name: true } } },
                orderBy: { date: 'desc' }
            }),
            prisma.storeOrder.findMany({
                where,
                include: { member: true, tenant: { select: { name: true } } },
                orderBy: { date: 'desc' }
            })
        ]);

        // ... summary logic (same as before)
        const incomeFromInvoices = invoices.reduce((acc, inv) => acc + Number(inv.amount), 0);
        const incomeFromPOS = storeOrders.reduce((acc, order) => acc + Number(order.total), 0);
        const totalIncome = incomeFromInvoices + incomeFromPOS;
        const totalExpenses = expenses.reduce((acc, exp) => acc + Number(exp.amount), 0);
        const netProfit = totalIncome - totalExpenses;
        const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

        // ... monthlyData logic (same as before)
        const monthlyData = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();

            const mIncome = invoices.filter(inv => {
                const date = inv.paidDate || inv.dueDate;
                return date.getMonth() === m && date.getFullYear() === y;
            }).reduce((acc, inv) => acc + Number(inv.amount), 0) +
                storeOrders.filter(o => {
                    const date = o.date;
                    return date.getMonth() === m && date.getFullYear() === y;
                }).reduce((acc, o) => acc + Number(o.total), 0);

            const mExpenses = expenses.filter(exp => {
                const date = exp.date;
                return date.getMonth() === m && date.getFullYear() === y;
            }).reduce((acc, exp) => acc + Number(exp.amount), 0);

            monthlyData.push({
                month: monthNames[m],
                income: mIncome,
                expenses: mExpenses
            });
        }

        // Recent transactions (Combined)
        const recentTransactions = [
            ...invoices.map(inv => ({
                id: inv.invoiceNumber,
                type: 'Membership',
                member: inv.member ? inv.member.name : 'Unknown',
                amount: Number(inv.amount),
                date: (inv.paidDate || inv.dueDate).toISOString().split('T')[0],
                status: inv.status,
                method: inv.paymentMode || 'Cash',
                branch: inv.tenant?.name || 'Main Branch',
                flow: 'in'
            })),
            ...storeOrders.map(o => ({
                id: `ORD-${o.id}`,
                type: 'POS Sale',
                member: o.member ? o.member.name : (o.guestName || 'Guest'),
                amount: Number(o.total),
                date: o.date.toISOString().split('T')[0],
                status: o.status,
                method: 'POS',
                branch: o.tenant?.name || 'Main Branch',
                flow: 'in'
            })),
            ...expenses.map(exp => ({
                id: `EXP-${exp.id}`,
                type: exp.category || 'General',
                member: exp.vendor || (exp.addedBy || 'Admin'),
                amount: Number(exp.amount),
                date: exp.date.toISOString().split('T')[0],
                status: exp.status || 'Paid',
                method: 'Expense',
                branch: exp.tenant?.name || 'Main Branch',
                flow: 'out'
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);

        res.json({
            summary: {
                totalIncome,
                totalExpenses,
                netProfit,
                margin: Math.round(margin),
                incomeBreakdown: {
                    memberships: incomeFromInvoices,
                    pos: incomeFromPOS
                }
            },
            monthlyData,
            transactions: recentTransactions
        });

    } catch (error) {
        console.error('Finance stats error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Expense Categories
const getExpenseCategories = async (req, res) => {
    try {
        const { branchId: qBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { role, tenantId: userTenantId, email, name: userName } = req.user;

        const branchId = qBranchId || headerTenantId;

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                where.tenantId = { in: [parseInt(branchId), 1] };
            }
        } else {
            if (branchId && branchId !== 'all') {
                where.tenantId = { in: [parseInt(branchId), userTenantId || 1] };
            } else {
                const branches = await prisma.tenant.findMany({
                    where: { OR: [{ id: userTenantId }, { owner: email }, { owner: userName }] },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const categories = await prisma.expenseCategory.findMany({
            where,
            orderBy: { name: 'asc' }
        });

        // Remove duplicate categories by name if overlapping between global and branch
        const uniqueCategories = Array.from(new Map(categories.map(c => [c.name.toLowerCase().trim(), c])).values());

        res.status(200).json(uniqueCategories);
    } catch (error) {
        console.error('Error fetching expense categories:', error);
        res.status(500).json({ message: 'Failed to fetch expense categories' });
    }
};

const createExpenseCategory = async (req, res) => {
    try {
        const { name, description, branchId } = req.body;
        const tenantId = req.user.tenantId;

        let targetTenantId = tenantId;
        if ((req.user.role === 'SUPER_ADMIN' || req.user.role === 'BRANCH_ADMIN') && branchId && branchId !== 'all') {
            targetTenantId = parseInt(branchId);
        }

        if (!targetTenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID is required for creating an expense category' });
        }

        const newCategory = await prisma.expenseCategory.create({
            data: {
                tenantId: targetTenantId || 1,
                name,
                description: description || null
            }
        });

        res.status(201).json(newCategory);
    } catch (error) {
        console.error('Error adding expense category:', error);
        res.status(500).json({ message: 'Failed to add expense category' });
    }
};

const deleteExpenseCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;

        const category = await prisma.expenseCategory.findUnique({
            where: { id: parseInt(id) }
        });

        if (!category) {
            return res.status(404).json({ message: 'Expense category not found' });
        }

        if (req.user.role !== 'SUPER_ADMIN' && category.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: category.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
            });
            if (!isOwner) {
                return res.status(403).json({ message: 'Not authorized to delete this expense category' });
            }
        }

        await prisma.expenseCategory.delete({
            where: { id: parseInt(id) }
        });

        res.status(200).json({ message: 'Expense category deleted successfully' });
    } catch (error) {
        console.error('Error deleting expense category:', error);
        res.status(500).json({ message: 'Failed to delete expense category' });
    }
};

module.exports = {
    getExpenses,
    createExpense,
    getInvoices,
    receivePayment,
    getTransactions,
    deleteExpense,
    getFinanceStats,
    createInvoice,
    getInvoiceById,
    deleteInvoice,
    getExpenseCategories,
    createExpenseCategory,
    deleteExpenseCategory,
    settleInvoice
};
