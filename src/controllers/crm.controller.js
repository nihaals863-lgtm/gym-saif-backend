const prisma = require('../config/prisma');

// --- LEADS ---

// Check for duplicate lead by phone or email
const checkDuplicateLead = async (req, res) => {
    try {
        const { phone, email, branchId } = req.body;
        const { tenantId: userTenantId, role } = req.user;

        const targetTenantId = (branchId && branchId !== 'all') ? parseInt(branchId) : userTenantId;

        const conditions = [];
        if (phone) conditions.push({ phone, tenantId: targetTenantId });
        if (email) conditions.push({ email, tenantId: targetTenantId });

        if (conditions.length === 0) return res.json({ isDuplicate: false });

        const existingLead = await prisma.lead.findFirst({
            where: { OR: conditions },
            select: { id: true, name: true, phone: true, email: true, status: true }
        });

        res.json({
            isDuplicate: !!existingLead,
            existingLead: existingLead || null
        });
    } catch (error) {
        console.error('Check Duplicate Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createLead = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const {
            name, phone, email: leadEmail, gender, age, interests, source,
            budgetRange, preferredContact, assignedTo, followUpDate, followUpTime, notes,
            branchId: bodyBranchId
        } = req.body;
        const queryBranchId = req.query.branchId;
        const headerTenantId = req.headers['x-tenant-id'];

        // Prioritize branch identifier
        const effectiveBranchId = bodyBranchId || queryBranchId || headerTenantId;

        let targetTenantId = userTenantId;

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                targetTenantId = parseInt(effectiveBranchId);
            } else {
                return res.status(400).json({ message: 'Branch ID is required for Super Admin to create a lead.' });
            }
        } else if (effectiveBranchId && effectiveBranchId !== 'all') {
            targetTenantId = parseInt(effectiveBranchId);
        }

        if (!targetTenantId) {
            return res.status(403).json({ message: 'Unauthorized: No branch context found.' });
        }

        // --- DUPLICATE CHECK ---
        const dupeConditions = [];
        if (phone) dupeConditions.push({ phone, tenantId: targetTenantId });
        if (leadEmail) dupeConditions.push({ email: leadEmail, tenantId: targetTenantId });

        if (dupeConditions.length > 0) {
            const existingLead = await prisma.lead.findFirst({
                where: { OR: dupeConditions }
            });
            if (existingLead) {
                return res.status(409).json({
                    message: `A lead with this ${existingLead.phone === phone ? 'phone number' : 'email'} already exists: ${existingLead.name} (${existingLead.status})`,
                    existingLead: { id: existingLead.id, name: existingLead.name, status: existingLead.status }
                });
            }
        }

        // Combine date and time to nextFollowUp
        let nextFollowUp = null;
        if (followUpDate) {
            nextFollowUp = new Date(followUpDate);
            if (followUpTime) {
                const [hours, minutes] = followUpTime.split(':');
                nextFollowUp.setHours(hours, minutes);
            }
        }

        const lead = await prisma.lead.create({
            data: {
                tenantId: targetTenantId,
                name,
                phone,
                email: leadEmail,
                gender,
                age: age ? parseInt(age) : null,
                interests: Array.isArray(interests) ? JSON.stringify(interests) : (interests || null),
                source,
                budget: budgetRange || null,
                preferredContact: preferredContact || "WhatsApp",
                assignedToId: assignedTo ? parseInt(assignedTo) : null,
                notes: notes || null,
                nextFollowUp,
                status: 'New'
            }
        });

        // --- NOTIFICATION ---
        const staffToNotify = await prisma.user.findMany({
            where: {
                tenantId: targetTenantId,
                OR: [
                    { role: { in: ['BRANCH_ADMIN', 'MANAGER'] } },
                    { id: assignedTo ? parseInt(assignedTo) : undefined }
                ].filter(c => c.id !== undefined || c.role !== undefined)
            },
            select: { id: true }
        });

        if (staffToNotify.length > 0) {
            await prisma.notification.createMany({
                data: staffToNotify.map(s => ({
                    userId: s.id,
                    title: 'New Lead Added',
                    message: `${name} has been added as a lead. Source: ${source || 'Unknown'}`,
                    type: 'info',
                    link: '/crm/leads'
                }))
            });
        }

        res.status(201).json(lead);
    } catch (error) {
        console.error('Create Lead Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getLeads = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName, id: userId } = req.user;
        const { search, status, assignedTo, branchId: queryBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        // Prioritize branch identifier
        const effectiveBranchId = queryBranchId || headerTenantId;

        const where = {};

        // Security & Filtering by branch
        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else {
            // Logic for BRANCH_ADMIN / MANAGER / etc.
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            } else {
                // If 'all' or not specified, limit to branches managed by this user
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userTenantId || undefined },
                            { owner: email || undefined },
                            { owner: userName || undefined }
                        ].filter(cond => Object.values(cond)[0] !== undefined)
                    },
                    select: { id: true }
                });
                const managedBranchIds = branches.map(b => b.id);
                where.tenantId = { in: managedBranchIds };
            }
        }

        // Status Filter
        if (status && status !== 'All') where.status = status;

        // STAFF and TRAINER only see their assigned leads
        if (role === 'TRAINER' || role === 'STAFF') {
            where.assignedToId = userId;
        } else if (assignedTo) {
            where.assignedToId = parseInt(assignedTo);
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } }
            ];
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leads);
    } catch (error) {
        console.error('Get Leads Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getLeadById = async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await prisma.lead.findUnique({
            where: { id: parseInt(id) },
            include: {
                assignedTo: { select: { id: true, name: true } },
                followUps: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    } catch (error) {
        console.error('Get Lead ID Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, lostReason, planId, trainerId, paymentMethod, referralCode } = req.body;

        const lead = await prisma.lead.findUnique({ where: { id: parseInt(id) } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // --- LOST ---
        if (status === 'Lost') {
            const updatedLead = await prisma.lead.update({
                where: { id: parseInt(id) },
                data: { status: 'Lost', lostReason: lostReason || null }
            });
            return res.json(updatedLead);
        }

        // --- CONVERTED ---
        if (status === 'Converted' && lead.status !== 'Converted') {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('123456', 10);
            const userEmail = lead.email || `m${Date.now()}@branch${lead.tenantId}.com`;

            // Check if user already exists
            let existingUser = await prisma.user.findUnique({ where: { email: userEmail } });
            if (existingUser) {
                return res.status(400).json({ message: `A user with email ${userEmail} already exists. Cannot convert lead.` });
            }

            // Create user
            const newUser = await prisma.user.create({
                data: {
                    name: lead.name,
                    email: userEmail,
                    password: hashedPassword,
                    phone: lead.phone,
                    role: 'MEMBER',
                    tenantId: lead.tenantId,
                    status: 'Active'
                }
            });

            // Determine plan and expiry
            let selectedPlan = null;
            let expiryDate = null;
            if (planId) {
                selectedPlan = await prisma.membershipPlan.findUnique({ where: { id: parseInt(planId) } });
                if (selectedPlan) {
                    expiryDate = new Date();
                    if (selectedPlan.durationType === 'Days') {
                        expiryDate.setDate(expiryDate.getDate() + selectedPlan.duration);
                    } else if (selectedPlan.durationType === 'Weeks') {
                        expiryDate.setDate(expiryDate.getDate() + (selectedPlan.duration * 7));
                    } else if (selectedPlan.durationType === 'Years') {
                        expiryDate.setFullYear(expiryDate.getFullYear() + selectedPlan.duration);
                    } else {
                        expiryDate.setMonth(expiryDate.getMonth() + selectedPlan.duration);
                    }
                }
            }

            // Create Member profile
            const newMember = await prisma.member.create({
                data: {
                    userId: newUser.id,
                    tenantId: lead.tenantId,
                    memberId: `MEM-LEAD-${Date.now()}-${lead.tenantId}`,
                    name: lead.name,
                    email: userEmail,
                    phone: lead.phone,
                    status: 'Active',
                    joinDate: new Date(),
                    expiryDate: expiryDate,
                    gender: lead.gender || 'Other',
                    source: lead.source || 'Walk-in',
                    planId: selectedPlan ? selectedPlan.id : null,
                    trainerId: trainerId ? parseInt(trainerId) : null,
                    referralCode: referralCode || null,
                    benefits: '[]'
                }
            });

            // Create Invoice if plan is selected
            if (selectedPlan) {
                const invoiceNumber = `INV-LEAD-${Date.now()}`;
                await prisma.invoice.create({
                    data: {
                        tenantId: lead.tenantId,
                        invoiceNumber,
                        memberId: newMember.id,
                        subtotal: selectedPlan.price,
                        taxRate: 0,
                        taxAmount: 0,
                        discount: 0,
                        amount: selectedPlan.price,
                        status: paymentMethod ? 'Paid' : 'Unpaid',
                        paymentMode: paymentMethod || 'Cash',
                        dueDate: new Date(),
                        paidDate: paymentMethod ? new Date() : null,
                        items: {
                            create: {
                                description: `Membership Plan: ${selectedPlan.name}`,
                                quantity: 1,
                                rate: selectedPlan.price,
                                amount: selectedPlan.price
                            }
                        }
                    }
                });
            }
        }

        const updatedData = { status };
        if (referralCode) {
            updatedData.source = 'Referral';
            updatedData.notes = JSON.stringify({ referrerId: referralCode });
        }

        const updatedLead = await prisma.lead.update({
            where: { id: parseInt(id) },
            data: updatedData
        });

        res.json(updatedLead);
    } catch (error) {
        console.error('Update Lead Status Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, source, notes, age, gender, budgetRange, assignedTo, followUpDate, followUpTime } = req.body;

        let nextFollowUp = undefined;
        if (followUpDate) {
            nextFollowUp = new Date(followUpDate);
            if (followUpTime) {
                const [hours, minutes] = followUpTime.split(':');
                nextFollowUp.setHours(hours, minutes);
            }
        }

        const updatedLead = await prisma.lead.update({
            where: { id: parseInt(id) },
            data: {
                name,
                email,
                phone,
                source,
                notes,
                age: age ? parseInt(age) : undefined,
                gender,
                budget: budgetRange,
                assignedToId: assignedTo ? parseInt(assignedTo) : undefined,
                nextFollowUp
            }
        });

        res.json(updatedLead);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteLead = async (req, res) => {
    try {
        const { id } = req.params;

        // Delete dependent follow-ups first
        await prisma.followUp.deleteMany({
            where: { leadId: parseInt(id) }
        });

        await prisma.lead.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- FOLLOW-UPS ---

const getTodayFollowUps = async (req, res) => {
    try {
        const { tenantId, role, id: userId } = req.user;

        if (!tenantId && role !== 'SUPER_ADMIN') {
            return res.json([]);
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const where = {
            nextFollowUp: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ['Converted', 'Lost'] }
        };

        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        // STAFF and TRAINER only see their assigned follow-ups
        if (role === 'STAFF' || role === 'TRAINER') {
            where.assignedToId = userId;
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true } }
            }
        });

        res.json(leads);
    } catch (error) {
        console.error('Get Followups Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const addFollowUp = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { notes, nextDate, status } = req.body;

        const followUp = await prisma.followUp.create({
            data: {
                leadId: parseInt(leadId),
                notes,
                nextDate: nextDate ? new Date(nextDate) : null,
                status: status || 'Completed'
            }
        });

        // Update lead's next follow-up and status if needed
        await prisma.lead.update({
            where: { id: parseInt(leadId) },
            data: {
                nextFollowUp: nextDate ? new Date(nextDate) : null,
                status: status || undefined,
                updatedAt: new Date()
            }
        });

        res.status(201).json(followUp);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createLead,
    getLeads,
    updateLeadStatus,
    updateLead,
    deleteLead,
    getTodayFollowUps,
    addFollowUp,
    getLeadById,
    checkDuplicateLead
};
