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
        } else if (statusFilter === 'Partially Paid') {
            storeWhere.id = -1; // exclude all store orders for partial filter
        }

        // Handle Payrolls
        let payrollWhere = { ...branchWhere };
        if (role === 'STAFF' || role === 'TRAINER') {
            payrollWhere.staffId = req.user.id;
        }

        if (statusFilter === 'Paid') {
            payrollWhere.status = 'Paid';
        } else if (statusFilter === 'Unpaid') {
            payrollWhere.status = { in: ['Approved', 'Confirmed', 'Rejected'] };
        } else if (statusFilter === 'Partially Paid') {
            payrollWhere.id = -1; // exclude all payrolls for partial filter
        } else {
            payrollWhere.status = { in: ['Approved', 'Confirmed', 'Rejected', 'Paid'] };
        }

        const [invoices, allInvoices, storeOrdersFull, allStoreOrders, payrollsFull, allPayrolls] = await Promise.all([
            prisma.invoice.findMany({
                where: listWhere,
                include: { member: true, items: true, tenant: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.invoice.findMany({
                where: branchWhere,
                select: { id: true, amount: true, paidAmount: true, balance: true, status: true, memberId: true }
            }),
            prisma.storeOrder.findMany({
                where: storeWhere,
                include: { member: true, items: { include: { product: true } }, tenant: { select: { name: true } } },
                orderBy: { date: 'desc' }
            }),
            prisma.storeOrder.findMany({
                where: branchWhere,
                select: { id: true, total: true, status: true, memberId: true }
            }),
            prisma.payroll.findMany({
                where: payrollWhere,
                include: { staff: true, tenant: { select: { name: true } } },
                orderBy: [
                    { year: 'desc' },
                    { month: 'desc' }
                ]
            }),
            prisma.payroll.findMany({
                where: payrollWhere,
                select: { id: true, amount: true, status: true, staffId: true }
            })
        ]);

        const mappedInvoices = invoices.map(inv => ({
            ...inv,
            amount: Number(inv.amount),
            balance: Number(inv.balance),
            paidAmount: Number(inv.paidAmount),
            subtotal: Number(inv.subtotal),
            taxAmount: Number(inv.taxAmount),
            discount: Number(inv.discount),
            type: 'Membership'
        }));

        const mappedPOS = storeOrdersFull.map(order => ({
            id: `pos-${order.id}`,
            internalId: order.id,
            type: 'POS Sale',
            invoiceNumber: `POS-#${order.id}`,
            amount: Number(order.total),
            balance: order.status === 'Completed' || order.status === 'Processing' ? 0 : Number(order.total),
            status: order.status === 'Completed' || order.status === 'Processing' ? 'Paid' : 'Unpaid',
            dueDate: order.date,
            paidDate: order.date,
            member: order.member || { name: order.guestName || 'Walk-in Guest', memberId: 'GUEST' },
            tenant: order.tenant,
            items: order.items.map(i => ({
                description: i.product?.name || 'Store Product',
                quantity: i.quantity,
                rate: Number(i.priceAtBuy),
                amount: Number(i.quantity) * Number(i.priceAtBuy)
            })),
            paymentMode: order.paymentMode
        }));

        const mappedPayroll = payrollsFull.map(p => {
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            return {
                id: `payroll-${p.id}`,
                internalId: p.id,
                type: 'Payroll',
                invoiceNumber: `PAY-${p.year}-${String(p.month).padStart(2, '0')}-${p.id}`,
                amount: Number(p.amount),
                balance: p.status === 'Paid' ? 0 : Number(p.amount),
                status: p.status === 'Approved' || p.status === 'Confirmed' ? 'Unpaid' : (p.status === 'Paid' ? 'Paid' : (p.status === 'Rejected' ? 'Rejected' : 'Pending')),
                payrollStatus: p.status, // Original status for logic
                rejectionReason: p.rejectionReason,
                dueDate: new Date(p.year, p.month, 0),
                createdAt: new Date(p.year, p.month - 1, 1),
                member: { name: p.staff?.name || 'Staff Member', memberId: `EMP-${p.staffId}` },
                tenant: p.tenant,
                serviceName: `Salary for ${monthNames[p.month - 1]} ${p.year}`,
                items: [
                    { description: 'Base Salary', quantity: 1, rate: Number(p.baseSalary), amount: Number(p.baseSalary) },
                    { description: 'Commission', quantity: 1, rate: Number(p.commission), amount: Number(p.commission) },
                    { description: 'Leave Deduction', quantity: 1, rate: -Number(p.leaveDeduction), amount: -Number(p.leaveDeduction) }
                ]
            };
        });

        const combinedInvoices = [...mappedInvoices, ...mappedPOS, ...mappedPayroll].sort((a, b) => {
            const dateB = b.createdAt || b.date || b.dueDate;
            const dateA = a.createdAt || a.date || a.dueDate;
            return new Date(dateB) - new Date(dateA);
        });

        const uniqueInvoicingClients = new Set(allInvoices.filter(i => i.memberId).map(i => i.memberId));
        const uniqueStoreClients = new Set(allStoreOrders.filter(o => o.memberId).map(o => o.memberId));
        const uniquePayrollStaffs = new Set(allPayrolls.map(p => p.staffId));
        const combinedClients = new Set([...uniqueInvoicingClients, ...uniqueStoreClients, ...uniquePayrollStaffs]).size;

        const totalPaidInvoices = allInvoices.reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);
        const totalPaidStore = allStoreOrders.filter(o => o.status === 'Paid' || o.status === 'Processing' || o.status === 'Completed').reduce((acc, o) => acc + Number(o.total), 0);
        const totalPaidPayroll = allPayrolls.filter(p => p.status === 'Paid').reduce((acc, p) => acc + Number(p.amount), 0);

        const totalUnpaidInvoices = allInvoices.reduce((acc, i) => acc + Number(i.balance || 0), 0);
        const totalUnpaidStore = allStoreOrders.filter(o => o.status !== 'Paid' && o.status !== 'Processing' && o.status !== 'Completed').reduce((acc, o) => acc + Number(o.total), 0);
        const totalUnpaidPayroll = allPayrolls.filter(p => ['Approved', 'Confirmed', 'Rejected'].includes(p.status)).reduce((acc, p) => acc + Number(p.amount), 0);

        res.status(200).json({
            invoices: combinedInvoices,
            stats: {
                clients: combinedClients,
                totalInvoices: allInvoices.length + allStoreOrders.length + allPayrolls.length,
                paid: totalPaidInvoices + totalPaidStore + totalPaidPayroll,
                unpaid: totalUnpaidInvoices + totalUnpaidStore + totalUnpaidPayroll
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
                paidAmount: 0,
                balance: totalAmount,
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
                paidAmount: finalAmount,
                balance: 0,
                subtotal: baseAmount,
                paymentMode: method || 'Cash',
                status: 'Paid',
                dueDate: new Date(),
                paidDate: new Date(),
                notes: referenceNumber ? `[Ref: ${referenceNumber}] ${notes || ''}`.trim() : (notes || null),
                items: {
                    create: [{
                        description: paymentType || (notes ? notes.substring(0, 50) : 'Manual Payment'),
                        quantity: 1,
                        rate: finalAmount,
                        amount: finalAmount
                    }]
                }
            },
            include: { member: true }
        });

        // Log the payment event
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'Payment',
                module: 'Finance',
                details: `Payment of ₹${finalAmount} received via ${method || 'Cash'} for ${newInvoice.member?.name}. Receipt: ${newInvoice.invoiceNumber}`,
                ip: req.ip || '0.0.0.0',
                status: 'Success'
            }
        });

        // Notify admins/managers
        const staffToNotify = await prisma.user.findMany({
            where: {
                tenantId: tenantId || 1,
                role: { in: ['BRANCH_ADMIN', 'MANAGER'] }
            },
            select: { id: true }
        });

        if (staffToNotify.length > 0) {
            await prisma.notification.createMany({
                data: staffToNotify.map(s => ({
                    userId: s.id,
                    title: 'Payment Received',
                    message: `₹${finalAmount} received from ${newInvoice.member?.name}`,
                    type: 'success',
                    link: `/branchadmin/finance/invoices`
                }))
            });
        }

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

        // Handle Payrolls
        if (id.startsWith('payroll-')) {
            const internalId = parseInt(id.replace('payroll-', ''));
            const payroll = await prisma.payroll.findUnique({
                where: { id: internalId }
            });

            if (!payroll) return res.status(404).json({ message: 'Payroll record not found' });

            // Authorization check
            if (role !== 'SUPER_ADMIN' && payroll.tenantId !== tenantId) {
                const isOwner = await prisma.tenant.findFirst({
                    where: { id: payroll.tenantId, OR: [{ owner: req.user.email }, { owner: req.user.name }] }
                });
                if (!isOwner) {
                    return res.status(403).json({ message: 'Not authorized to update this payroll' });
                }
            }

            const updatedPayroll = await prisma.payroll.update({
                where: { id: internalId },
                data: {
                    status: 'Paid'
                }
            });

            // Log the payment settlement
            await prisma.auditLog.create({
                data: {
                    userId: req.user.id,
                    action: 'Payroll Settlement',
                    module: 'Finance',
                    details: `Payroll for Staff ID ${payroll.staffId} (Period: ${payroll.month}/${payroll.year}) marked as Paid. Method: ${method || 'Cash'}`,
                    ip: req.ip || '0.0.0.0',
                    status: 'Success'
                }
            });

            return res.json({
                message: 'Payroll settled successfully',
                invoice: { 
                    ...updatedPayroll, 
                    id: `payroll-${updatedPayroll.id}`,
                    status: 'Paid',
                    invoiceNumber: `PAY-${updatedPayroll.year}-${String(updatedPayroll.month).padStart(2, '0')}-${updatedPayroll.id}`
                }
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

        // Partial Payment Logic
        const amountToPayNow = parseFloat(amount) || 0;
        const newPaidAmount = Number(invoice.paidAmount) + amountToPayNow;
        const newBalance = Number(invoice.amount) - newPaidAmount;
        
        let newStatus = 'Paid';
        if (newBalance > 0) {
            newStatus = 'Partially Paid';
        } else if (newBalance < 0) {
            // Overpaid case - just mark as Paid (or handle as credit later)
            newStatus = 'Paid';
        }

        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                paymentMode: method || 'Cash',
                status: newStatus,
                paidAmount: newPaidAmount,
                balance: Math.max(0, newBalance),
                paidDate: new Date(date || new Date()),
                balanceDueDate: req.body.balanceDueDate ? new Date(req.body.balanceDueDate) : invoice.balanceDueDate,
                notes: updatedNotes
            }
        });

        // Activation logic: If this member has a PT account in 'Pending Payment' status, activate it
        if (updatedInvoice.memberId) {
            // Find PT accounts that might need activation or commission
            // We look for 'Pending Payment' to activate, and also check if it's a PT invoice to trigger commission logic
            const isPTInvoice = updatedInvoice.notes?.toLowerCase().includes('personal training') || 
                               updatedInvoice.notes?.toLowerCase().includes('pt package');

            const accountsToProcess = await prisma.pTMemberAccount.findMany({
                where: {
                    memberId: updatedInvoice.memberId,
                    OR: [
                        { status: 'Pending Payment' },
                        { status: 'Active' } // Catch accounts that might have been activated already
                    ]
                },
                include: {
                    package: true
                }
            });

            if (accountsToProcess.length > 0) {
                // Get member and trainer details
                const member = await prisma.member.findUnique({
                    where: { id: updatedInvoice.memberId },
                    include: { trainer: true }
                });

                // Activate accounts that are pending
                const pendingAccountIds = accountsToProcess.filter(a => a.status === 'Pending Payment').map(a => a.id);
                if (pendingAccountIds.length > 0) {
                    await prisma.pTMemberAccount.updateMany({
                        where: { id: { in: pendingAccountIds } },
                        data: { status: 'Active' }
                    });
                }

                // Distribute commissions if trainer is assigned AND it's a PT related invoice
                if (member && member.trainer && isPTInvoice) {
                    const trainer = member.trainer;
                    
                    // Get commission % from trainer config
                    let commissionPercent = 0;
                    if (trainer.config) {
                        try {
                            const config = typeof trainer.config === 'string' ? JSON.parse(trainer.config) : trainer.config;
                            commissionPercent = parseFloat(config.commission) || parseFloat(config.commissionPercent) || parseFloat(config.ptSharePercent) || 0;
                        } catch (e) {
                            console.error('Error parsing trainer config for commission:', e);
                        }
                    }

                    if (commissionPercent > 0) {
                        for (const account of accountsToProcess) {
                            // Check if commissions already exist for this invoice and account
                            const existing = await prisma.commission.findFirst({
                                where: { invoiceId: updatedInvoice.id, ptAccountId: account.id }
                            });
                            
                            if (existing) continue;

                            const pkg = account.package;
                            const totalCommission = (parseFloat(pkg.price) * commissionPercent) / 100;
                            const months = Math.max(1, Math.round(pkg.validityDays / 30));
                            const monthlyAmount = totalCommission / months;
                            
                            const commissionsToCreate = [];
                            for (let i = 0; i < months; i++) {
                                const targetDate = new Date();
                                targetDate.setMonth(targetDate.getMonth() + i);
                                
                                commissionsToCreate.push({
                                    tenantId: updatedInvoice.tenantId,
                                    trainerId: trainer.id,
                                    memberId: member.id,
                                    invoiceId: updatedInvoice.id,
                                    ptAccountId: account.id,
                                    amount: monthlyAmount,
                                    month: targetDate.getMonth() + 1,
                                    year: targetDate.getFullYear(),
                                    status: 'Pending',
                                    description: `Monthly portion for PT Package: ${pkg.name} (Month ${i + 1}/${months})`
                                });
                            }
                            
                            if (commissionsToCreate.length > 0) {
                                await prisma.commission.createMany({
                                    data: commissionsToCreate
                                });
                            }
                        }
                    }
                }
            }
        }
        // Log the payment settlement
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'Payment Settlement',
                module: 'Finance',
                details: `Invoice ${updatedInvoice.invoiceNumber} settled for ${updatedInvoice.amount}. Method: ${method || 'Cash'}`,
                ip: req.ip || '0.0.0.0',
                status: 'Success'
            }
        });

        // Notify admins/managers
        const adminsToNotify = await prisma.user.findMany({
            where: {
                tenantId: updatedInvoice.tenantId,
                role: { in: ['BRANCH_ADMIN', 'MANAGER'] }
            },
            select: { id: true }
        });

        if (adminsToNotify.length > 0) {
            await prisma.notification.createMany({
                data: adminsToNotify.map(s => ({
                    userId: s.id,
                    title: 'Invoice Settled',
                    message: `Invoice ${updatedInvoice.invoiceNumber} has been marked as Paid.`,
                    type: 'success',
                    link: `/branchadmin/finance/invoices`
                }))
            });
        }

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
                include: { 
                    member: true, 
                    tenant: { select: { name: true } },
                    items: true 
                },
                orderBy: { paidDate: 'desc' }
            }),
            prisma.storeOrder.findMany({
                where: storeWhere,
                include: { 
                    member: true, 
                    tenant: { select: { name: true } },
                    items: {
                        include: { product: true }
                    }
                },
                orderBy: { date: 'desc' }
            })
        ]);

        const formattedInvoices = invoices.map(inv => ({
            id: inv.invoiceNumber,
            internalId: inv.id,
            member: inv.member ? inv.member.name : 'Unknown',
            type: 'Membership',
            serviceName: inv.items?.length > 0 ? inv.items.map(i => i.description).join(', ') : (inv.notes || 'Gym Membership'),
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
            serviceName: o.items?.length > 0 ? o.items.map(i => `${i.product?.name || 'Product'} x${i.quantity}`).join(', ') : 'POS Sale',
            method: o.paymentMode || 'POS',
            amount: Number(o.total),
            date: o.date,
            status: o.status === 'Completed' || o.status === 'Processing' ? 'Paid' : (o.status === 'Paid' ? 'Paid' : 'Unpaid'),
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

        // Handle Payrolls
        if (id.startsWith('payroll-')) {
            const internalId = parseInt(id.replace('payroll-', ''));
            const p = await prisma.payroll.findUnique({
                where: { id: internalId },
                include: { staff: true, tenant: { select: { name: true } } }
            });

            if (!p) return res.status(404).json({ message: 'Payroll record not found' });

            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const mappedPayroll = {
                id: `payroll-${p.id}`,
                internalId: p.id,
                type: 'Payroll',
                invoiceNumber: `PAY-${p.year}-${String(p.month).padStart(2, '0')}-${p.id}`,
                amount: p.amount,
                status: p.status === 'Approved' || p.status === 'Confirmed' ? 'Unpaid' : (p.status === 'Paid' ? 'Paid' : (p.status === 'Rejected' ? 'Rejected' : 'Pending')),
                payrollStatus: p.status,
                rejectionReason: p.rejectionReason,
                dueDate: new Date(p.year, p.month, 0),
                createdAt: new Date(p.year, p.month - 1, 1),
                member: { name: p.staff?.name || 'Staff Member', memberId: `EMP-${p.staffId}` },
                tenant: p.tenant,
                serviceName: `Salary for ${monthNames[p.month - 1]} ${p.year}`,
                items: [
                    { description: 'Base Salary', quantity: 1, rate: p.baseSalary, amount: p.baseSalary },
                    { description: 'Commission', quantity: 1, rate: p.commission, amount: p.commission },
                    { description: 'Extra Bonus', quantity: 1, rate: p.extra_bonus || 0, amount: p.extra_bonus || 0 },
                    { description: 'Leave Deduction', quantity: 1, rate: -p.leaveDeduction, amount: -p.leaveDeduction }
                ],
                subtotal: p.amount, // Simplified
                taxAmount: 0,
                taxRate: 0,
                notes: `Payroll for ${p.staff?.name} for the period ${monthNames[p.month - 1]} ${p.year}`
            };

            return res.json(mappedPayroll);
        }

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

        // Handle Payrolls
        if (id.startsWith('payroll-')) {
            const internalId = parseInt(id.replace('payroll-', ''));
            const payroll = await prisma.payroll.findUnique({ where: { id: internalId } });

            if (!payroll) return res.status(404).json({ message: 'Payroll record not found' });

            // Authorization check: Only Admin can delete payroll from here
            if (role !== 'SUPER_ADMIN' && role !== 'BRANCH_ADMIN') {
                return res.status(403).json({ message: 'Unauthorized: Only admins can delete payroll records' });
            }

            // Cross-tenant check
            if (role !== 'SUPER_ADMIN' && payroll.tenantId !== userTenantId) {
                return res.status(403).json({ message: 'Unauthorized' });
            }

            if (payroll.status === 'Paid') {
                return res.status(400).json({ message: 'Cannot delete a payroll that has already been Paid' });
            }

            await prisma.payroll.delete({ where: { id: internalId } });
            return res.json({ message: 'Payroll deleted successfully' });
        }

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
                orderBy: { createdAt: 'desc' }
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
