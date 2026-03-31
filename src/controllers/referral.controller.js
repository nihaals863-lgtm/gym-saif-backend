const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllReferrals = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;
        const whereClause = { source: 'Referral' };

        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                whereClause.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                whereClause.tenantId = parseInt(branchId);
            } else {
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
                whereClause.tenantId = { in: managedBranchIds };
            }
        }

        const rawLeads = await prisma.lead.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: { tenant: { select: { name: true } } }
        });

        const formatted = await Promise.all(rawLeads.map(async (lead) => {
            let referrerName = 'N/A';
            let referrerId = null;
            let rewardStatus = 'Pending';
            if (lead.notes) {
                try {
                    const notesData = JSON.parse(lead.notes);
                    if (notesData.referrerId) {
                        referrerId = notesData.referrerId;
                        const referrer = await prisma.member.findFirst({
                            where: { memberId: String(notesData.referrerId) }
                        });
                        if (referrer) {
                            referrerName = referrer.name || referrer.memberId;
                        }
                    }
                } catch (e) { }
            }
            const item = {
                id: lead.id,
                referredName: lead.name,
                phone: lead.phone,
                email: lead.email,
                referrerId,
                referrerName,
                status: lead.status === 'Converted' ? 'Converted' : (lead.status === 'New' ? 'Pending' : lead.status),
                rewardStatus: lead.rewardStatus || 'Pending',
                branchName: lead.tenant?.name || 'Main Branch',
                createdAt: lead.createdAt
            };

            // Dynamic Eligibility Check
            if (item.status === 'Converted' && item.rewardStatus === 'Pending') {
                const member = await prisma.member.findFirst({
                    where: {
                        tenantId: lead.tenantId,
                        OR: [
                            { email: lead.email || undefined },
                            { phone: lead.phone || undefined }
                        ].filter(c => c.email !== undefined || c.phone !== undefined)
                    },
                    include: {
                        invoices: {
                            where: { status: 'Paid' },
                            take: 1
                        }
                    }
                });

                if (member && member.invoices.length > 0) {
                    item.rewardStatus = 'Eligible';
                }
            }

            return item;
        }));

        res.json(formatted);
    } catch (error) {
        console.error("Error fetching referrals:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.createReferral = async (req, res) => {
    try {
        const { referrerId, referredName, phone, email, branchId } = req.body;

        let tenantId = null;

        if (branchId && branchId !== 'all') {
            tenantId = parseInt(branchId);
        } else if (referrerId) {
            // Find referrer to get their branch
            const referrer = await prisma.member.findFirst({
                where: { memberId: String(referrerId) }
            });
            if (referrer) {
                tenantId = referrer.tenantId;
            }
        }

        if (!tenantId) {
            tenantId = req.user?.tenantId || 1;
        }

        const newLead = await prisma.lead.create({
            data: {
                tenantId: tenantId,
                name: referredName,
                phone,
                email,
                source: 'Referral',
                status: 'New',
                notes: JSON.stringify({ referrerId })
            }
        });

        res.status(201).json(newLead);
    } catch (error) {
        console.error("Error creating referral:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.verifyCode = async (req, res) => {
    try {
        const { code } = req.params;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;

        const whereClause = { memberId: code };

        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all') {
                whereClause.tenantId = parseInt(branchId);
            }
        } else {
            if (branchId && branchId !== 'all') {
                whereClause.tenantId = parseInt(branchId);
            } else {
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
                whereClause.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const member = await prisma.member.findFirst({
            where: whereClause
        });

        if (!member) {
            return res.json({ valid: false });
        }

        res.json({
            valid: true,
            referrerName: member.name || member.memberId
        });
    } catch (error) {
        console.error("Error verifying code:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.claimReward = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'Claimed' or 'Paid'

        const lead = await prisma.lead.update({
            where: { id: parseInt(id) },
            data: { rewardStatus: status || 'Claimed' }
        });

        // Add actual points to member's reward account if claimed
        if (status === 'Claimed' || status === 'Paid') {
            try {
                if (lead.notes) {
                    const notes = JSON.parse(lead.notes);
                    if (notes.referrerId) {
                        const referrer = await prisma.member.findFirst({
                            where: { memberId: String(notes.referrerId) }
                        });
                        if (referrer) {
                            // Fetch dynamic reward amount from settings
                            const settings = await prisma.tenantSettings.findUnique({
                                where: { tenantId: referrer.tenantId }
                            });
                            const rewardAmount = settings?.referralReward || 500;

                            await prisma.reward.create({
                                data: {
                                    tenantId: referrer.tenantId,
                                    memberId: referrer.id,
                                    name: "Referral Reward",
                                    points: rewardAmount,
                                    description: `Earned for referring ${lead.name}`
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Error awarding referral points:", e);
            }
        }

        res.json({ message: "Reward status updated", rewardStatus: lead.rewardStatus });
    } catch (error) {
        console.error("Error claiming reward:", error);
        res.status(500).json({ message: "Server error" });
    }
};
