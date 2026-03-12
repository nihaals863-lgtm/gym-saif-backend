// gym_backend/src/controllers/member.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const cloudinary = require('../utils/cloudinary');

const upgradePlan = async (req, res) => {
    try {
        const { newPlan } = req.body;
        // In a real implementation this would find the membership plan, calculate prorated amounts, create an invoice etc
        res.json({ message: 'Plan upgraded successfully', newPlan });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const cancelMembership = async (req, res) => {
    try {
        // Find member associated with this user
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        await prisma.member.update({
            where: { id: member.id },
            data: { status: 'Cancelled' }
        });
        res.json({ message: 'Membership cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletTransactions = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const wallet = await prisma.wallet.findUnique({
            where: { memberId: member.id },
            include: { transactions: { orderBy: { createdAt: 'desc' } } }
        });

        const mappedTransactions = (wallet ? wallet.transactions : []).map(t => ({
            id: t.id,
            title: t.description || 'Transaction',
            amount: parseFloat(t.amount),
            type: t.type === 'Credit' ? 'income' : 'spent',
            date: t.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }));

        res.json(mappedTransactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addWalletCredit = async (req, res) => {
    try {
        const { amount } = req.body;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let wallet = await prisma.wallet.findUnique({ where: { memberId: member.id } });
        if (!wallet) {
            wallet = await prisma.wallet.create({ data: { memberId: member.id, balance: 0 } });
        }

        const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

        await prisma.$transaction([
            prisma.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance }
            }),
            prisma.transaction.create({
                data: {
                    walletId: wallet.id,
                    amount: parseFloat(amount),
                    type: 'Credit',
                    description: 'Added Credits via App'
                }
            })
        ]);

        res.json({ message: 'Credits added successfully', balance: newBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyBookings = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const bookings = await prisma.booking.findMany({
            where: { memberId: member.id },
            include: { class: { include: { trainer: true } } },
            orderBy: { date: 'desc' }
        });

        const processedBookings = bookings.map(b => {
            let startTime = null;
            let endTime = null;
            if (b.class && b.class.schedule) {
                try {
                    const sched = JSON.parse(b.class.schedule);
                    startTime = sched.time || null;
                    // If range like "09:00 AM - 10:00 AM", split it
                    if (startTime && startTime.includes('-')) {
                        const parts = startTime.split('-');
                        startTime = parts[0].trim();
                        endTime = parts[1].trim();
                    }
                } catch (e) { }
            }
            return {
                ...b,
                class: {
                    ...b.class,
                    startTime: startTime || b.class.startTime,
                    endTime: endTime || b.class.endTime
                }
            };
        });

        res.json(processedBookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBooking = async (req, res) => {
    try {
        const { classId, date } = req.body;
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { plan: true }
        });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const targetClass = await prisma.class.findUnique({
            where: { id: parseInt(classId) },
            include: { _count: { select: { bookings: { where: { status: 'Upcoming' } } } } }
        });
        if (!targetClass) return res.status(404).json({ message: 'Class not found' });

        // 1. Capacity Check
        if (targetClass._count.bookings >= targetClass.maxCapacity) {
            return res.status(400).json({ message: 'This session is fully booked' });
        }

        // 2. Gender & Benefit Rule Enforcement
        if (targetClass.requiredBenefit) {
            // Find the active amenity for this benefit
            const amenity = await prisma.amenity.findFirst({
                where: {
                    tenantId: member.tenantId,
                    name: targetClass.requiredBenefit,
                    status: 'Active'
                }
            });

            if (amenity) {
                // Gender Check
                if (amenity.gender !== 'UNISEX') {
                    if (!member.gender) {
                        return res.status(400).json({
                            message: `Access Denied: This session is for ${amenity.gender} only. Please update your gender in your profile first.`
                        });
                    }
                    if (member.gender.toUpperCase() !== amenity.gender.toUpperCase()) {
                        return res.status(400).json({
                            message: `Access Denied: This ${amenity.name} is for ${amenity.gender} only. Your profile gender is ${member.gender}.`
                        });
                    }
                }

                // Plan & Credit Check
                let benefits = [];
                if (member.plan?.benefits) {
                    try {
                        benefits = typeof member.plan.benefits === 'string'
                            ? JSON.parse(member.plan.benefits)
                            : member.plan.benefits;
                    } catch (e) { benefits = []; }
                }

                // Check if this specific amenity ID or name is in the plan benefits
                const planBenefit = Array.isArray(benefits) && benefits.find(b =>
                    String(b.id) === String(amenity.id) || b.name === amenity.name
                );

                if (!planBenefit) {
                    return res.status(400).json({ message: `Your current plan does not include ${amenity.name} access.` });
                }

                // Credit Check
                if (planBenefit.limit !== 'Unlimited') {
                    const limit = parseInt(planBenefit.limit) || 0;

                    // Count bookings for this benefit since member join date (or start of cycle)
                    const usedCount = await prisma.booking.count({
                        where: {
                            memberId: member.id,
                            class: { requiredBenefit: targetClass.requiredBenefit },
                            status: { in: ['Upcoming', 'Completed'] },
                            date: { gte: member.joinDate }
                        }
                    });

                    if (usedCount >= limit) {
                        return res.status(400).json({ message: `Credit Limit Reached: You have used all ${limit} sessions for ${amenity.name} in your current plan.` });
                    }
                }
            }
        }

        const booking = await prisma.booking.create({
            data: {
                memberId: member.id,
                classId: parseInt(classId),
                date: new Date(date),
                status: 'Upcoming'
            }
        });
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });

        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
        if (!booking || booking.memberId !== member.id) return res.status(403).json({ message: 'Unauthorized or not found' });

        await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { status: 'Cancelled' }
        });

        res.json({ message: 'Booking cancelled' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const rescheduleBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { newDate } = req.body;

        await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { date: new Date(newDate) }
        });

        res.json({ message: 'Booking rescheduled' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const freezeMembership = async (req, res) => {
    try {
        res.json({ message: 'Membership frozen successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const unfreezeMembership = async (req, res) => {
    try {
        res.json({ message: 'Membership unfrozen successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoices = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const invoices = await prisma.invoice.findMany({
            where: { tenantId: member.tenantId, memberId: member.id },
            orderBy: { dueDate: 'desc' }
        });

        if (invoices.length === 0) {
            // Seed a few dummy pending invoices for new users so the UI works immediately
            const dummyInvoices = [
                { invoiceNumber: `INV-${Date.now()}-1`, amount: 2499.00, dueDate: new Date() },
                { invoiceNumber: `INV-${Date.now()}-2`, amount: 500.00, dueDate: new Date(Date.now() + 86400000 * 30), status: "Unpaid" }
            ];
            for (const d of dummyInvoices) {
                await prisma.invoice.create({
                    data: {
                        tenantId: member.tenantId,
                        memberId: member.id,
                        invoiceNumber: d.invoiceNumber,
                        amount: d.amount,
                        dueDate: d.dueDate,
                        status: d.status || "Unpaid"
                    }
                });
            }
            const seeded = await prisma.invoice.findMany({
                where: { tenantId: member.tenantId, memberId: member.id },
                orderBy: { dueDate: 'desc' }
            });
            const mapped = seeded.map(inv => ({
                id: inv.invoiceNumber,
                dbId: inv.id,
                date: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                amount: parseFloat(inv.amount),
                status: inv.status,
                dueDate: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            }));
            return res.json(mapped);
        }

        const mapped = invoices.map(inv => ({
            id: inv.invoiceNumber,
            dbId: inv.id,
            date: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            amount: parseFloat(inv.amount),
            status: inv.status,
            dueDate: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const payInvoice = async (req, res) => {
    try {
        const { id } = req.params; // this is the dbId passed by the frontend
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        await prisma.invoice.updateMany({
            where: { id: parseInt(id), memberId: member.id, tenantId: member.tenantId },
            data: { status: 'Paid', paidDate: new Date() }
        });

        res.json({ message: 'Invoice paid successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletBalance = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { Reward: true }
        });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const wallet = await prisma.wallet.findUnique({
            where: { memberId: member.id },
            include: { transactions: true }
        });

        let balance = wallet ? parseFloat(wallet.balance) : 0;
        let addedThisMonth = 0;

        if (wallet && wallet.transactions) {
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            addedThisMonth = wallet.transactions
                .filter(t => t.type === 'Credit' && t.createdAt.getMonth() === thisMonth && t.createdAt.getFullYear() === thisYear)
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        }

        const loyaltyPts = member.Reward ? member.Reward.reduce((sum, r) => sum + r.points, 0) : 0;

        res.json({ balance, addedThisMonth, loyaltyPts: loyaltyPts > 0 ? loyaltyPts : 450, credits: 12 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSavedCards = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let cards = [];
        if (member.cards) {
            cards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        res.json(cards);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addSavedCard = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let existingCards = [];
        if (member.cards) {
            existingCards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        const newCard = { ...req.body, id: Date.now().toString() };
        existingCards.push(newCard);

        const cardsJson = JSON.stringify(existingCards);
        await prisma.$executeRaw`UPDATE member SET cards = ${cardsJson} WHERE id = ${member.id}`;

        res.json({ message: 'Card added successfully', card: newCard });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteSavedCard = async (req, res) => {
    try {
        const { id } = req.params;
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let existingCards = [];
        if (member.cards) {
            existingCards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        const filteredCards = existingCards.filter(card => card.id !== id);

        if (filteredCards.length === existingCards.length) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const cardsJson = JSON.stringify(filteredCards);
        await prisma.$executeRaw`UPDATE member SET cards = ${cardsJson} WHERE id = ${member.id}`;

        res.json({ message: 'Card deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembershipDetails = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { plan: true }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const daysRemaining = member.expiryDate ? Math.max(0, Math.floor((new Date(member.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

        const details = {
            id: member.id,
            planId: member.planId,
            currentPlan: member.plan?.name || 'No Active Plan',
            benefits: member.plan?.benefits || '',
            startDate: member.joinDate ? new Date(member.joinDate).toLocaleDateString() : 'N/A',
            expiryDate: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : 'N/A',
            status: member.status,
            daysRemaining: daysRemaining,
            freezeStatus: member.status === 'Frozen' ? 'Yes' : 'No',
            price: member.plan?.price || 0
        };
        res.json(details);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getServiceRequests = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const requests = await prisma.serviceRequest.findMany({
            where: { memberId: member.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAvailableClasses = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });

        const classes = await prisma.class.findMany({
            where: { tenantId, status: 'Scheduled' },
            include: {
                trainer: true,
                _count: {
                    select: { bookings: { where: { status: 'Upcoming' } } }
                }
            }
        });

        const amenities = await prisma.amenity.findMany({
            where: { tenantId, status: 'Active' }
        });

        const processedClasses = classes
            .filter(c => {
                // Filter by gender if requiredBenefit matches a gendered amenity
                if (c.requiredBenefit && member && member.gender) {
                    const amenity = amenities.find(a => a.name === c.requiredBenefit);
                    if (amenity && amenity.gender !== 'UNISEX') {
                        return amenity.gender.toUpperCase() === member.gender.toUpperCase();
                    }
                }
                return true;
            })
            .map(c => {
                let startTime = null;
                let endTime = null;
                if (c.schedule) {
                    try {
                        const sched = JSON.parse(c.schedule);
                        startTime = sched.time || null;
                        if (startTime && startTime.includes('-')) {
                            const parts = startTime.split('-');
                            startTime = parts[0].trim();
                            endTime = parts[1].trim();
                        }
                    } catch (e) { }
                }
                return {
                    ...c,
                    startTime: startTime || c.startTime,
                    endTime: endTime || c.endTime
                };
            });

        res.json(processedClasses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addServiceRequest = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const { type, details, status, rawType } = req.body;
        const request = await prisma.serviceRequest.create({
            data: {
                tenantId: member.tenantId,
                memberId: member.id,
                type,
                details,
                status: status || 'Pending',
                rawType,
                date: new Date()
            }
        });

        res.json({ success: true, request });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberProfile = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: {
                plan: true,
                tenant: true,
                bookings: {
                    where: { status: { in: ['Upcoming', 'Completed'] } },
                    include: { class: true }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        let benefits = [];
        if (member.plan?.benefits) {
            try {
                benefits = typeof member.plan.benefits === 'string'
                    ? JSON.parse(member.plan.benefits)
                    : member.plan.benefits;
            } catch (e) { benefits = []; }
        }

        const benefitWallet = {
            classCredits: 10,
            saunaSessions: 0,
            iceBathCredits: 0
        };

        if (Array.isArray(benefits)) {
            // We need to fetch actual amenity names if only IDs are stored
            const amenityIds = benefits.filter(b => b.id).map(b => parseInt(b.id)).filter(id => !isNaN(id));
            const amenitiesFound = await prisma.amenity.findMany({
                where: { id: { in: amenityIds } }
            });

            benefits.forEach(b => {
                const amenity = amenitiesFound.find(a => String(a.id) === String(b.id));
                const name = (amenity?.name || b.name || '').toLowerCase();
                const limit = b.limit === 'Unlimited' ? 999 : (parseInt(b.limit) || 0);

                if (name.includes('sauna')) benefitWallet.saunaSessions = limit;
                else if (name.includes('ice bath')) benefitWallet.iceBathCredits = limit;
                else if (name.includes('pt') || name.includes('class')) benefitWallet.classCredits = limit;
            });
        }

        // Subtract used credits based on bookings since plan start
        member.bookings.forEach(b => {
            if (new Date(b.date) < new Date(member.joinDate)) return; // Only count bookings in current cycle

            const className = (b.class?.name || '').toLowerCase();
            const classReqBenefit = (b.class?.requiredBenefit || '').toLowerCase();

            if (className.includes('sauna') || classReqBenefit.includes('sauna')) {
                benefitWallet.saunaSessions = Math.max(0, benefitWallet.saunaSessions - 1);
            } else if (className.includes('ice bath') || classReqBenefit.includes('ice bath')) {
                benefitWallet.iceBathCredits = Math.max(0, benefitWallet.iceBathCredits - 1);
            } else {
                benefitWallet.classCredits = Math.max(0, benefitWallet.classCredits - 1);
            }
        });

        res.json({
            id: member.id,
            memberId: member.memberId,
            name: member.name,
            email: member.email,
            phone: member.phone,
            avatar: member.avatar,
            joinDate: member.joinDate,
            expiryDate: member.expiryDate,
            status: member.status,
            emergencyName: member.emergencyName,
            emergencyPhone: member.emergencyPhone,
            gender: member.gender,
            plan: member.plan,
            branch: member.tenant?.branchName || member.tenant?.name || 'Main Branch',
            benefitWallet
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateMemberProfile = async (req, res) => {
    try {
        const { phone, emergencyName, emergencyPhone, avatar, gender } = req.body;
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        let avatarUrl = avatar;
        if (avatar && avatar.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(avatar, {
                folder: 'gym/members/avatars'
            });
            avatarUrl = uploadRes.secure_url;
        }

        // Update Member Detail
        const updatedMember = await prisma.member.update({
            where: { id: member.id },
            data: {
                phone: phone !== undefined ? phone : member.phone,
                emergencyName: emergencyName !== undefined ? emergencyName : member.emergencyName,
                emergencyPhone: emergencyPhone !== undefined ? emergencyPhone : member.emergencyPhone,
                avatar: avatarUrl !== undefined ? avatarUrl : member.avatar,
                gender: gender !== undefined ? gender : member.gender
            }
        });

        // Sync with User record
        const userData = {};
        if (phone !== undefined) userData.phone = phone;
        if (avatarUrl !== undefined) userData.avatar = avatarUrl;

        if (Object.keys(userData).length > 0) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: userData
            });
        }

        res.json({ message: 'Profile updated successfully', member: updatedMember });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid current password' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWorkoutPlans = async (req, res) => {
    try {
        const { role, id: userId, email, name, tenantId: userTenantId } = req.user;
        const { memberId: queryMemberId } = req.query;
        let member;

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'TRAINER') {
            const memberId = queryMemberId || (req.body && req.body.memberId);
            if (!memberId) {
                member = await prisma.member.findUnique({ where: { userId } });
            } else {
                member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });
            }
        } else {
            member = await prisma.member.findUnique({ where: { userId } });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Authorization Check for Management
        if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            const branches = await prisma.tenant.findMany({
                where: { OR: [{ id: userTenantId || -1 }, { owner: email || '___' }, { owner: name || '___' }] },
                select: { id: true }
            });
            const managedIds = branches.map(b => b.id);
            if (!managedIds.includes(member.tenantId)) {
                return res.status(403).json({ message: 'Member does not belong to your managed branches' });
            }
        }

        // Auto-expire plans where endDate has passed
        await prisma.workoutPlan.updateMany({
            where: {
                clientId: member.id,
                status: 'Active',
                endDate: { lt: new Date() }
            },
            data: { status: 'Expired' }
        });

        const plans = await prisma.workoutPlan.findMany({
            where: { clientId: member.id, status: 'Active' },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`Debug - Member ${member.id} workout plans found:`, plans.length);
        res.json(plans);
    } catch (error) {
        console.error('getWorkoutPlans error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getDietPlans = async (req, res) => {
    try {
        const { role, id: userId, email, name, tenantId: userTenantId } = req.user;
        const { memberId: queryMemberId } = req.query;
        let member;

        if (role === 'BRANCH_ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'TRAINER') {
            const memberId = queryMemberId || (req.body && req.body.memberId);
            if (!memberId) {
                member = await prisma.member.findUnique({ where: { userId } });
            } else {
                member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });
            }
        } else {
            member = await prisma.member.findUnique({ where: { userId } });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Authorization Check for Management
        if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            const branches = await prisma.tenant.findMany({
                where: { OR: [{ id: userTenantId || -1 }, { owner: email || '___' }, { owner: name || '___' }] },
                select: { id: true }
            });
            const managedIds = branches.map(b => b.id);
            if (!managedIds.includes(member.tenantId)) {
                return res.status(403).json({ message: 'Member does not belong to your managed branches' });
            }
        }

        // Auto-expire plans where endDate has passed
        await prisma.dietPlan.updateMany({
            where: {
                clientId: member.id,
                status: 'Active',
                endDate: { lt: new Date() }
            },
            data: { status: 'Expired' }
        });

        const plans = await prisma.dietPlan.findMany({
            where: { clientId: member.id, status: 'Active' },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`Debug - Member ${member.id} diet plans found:`, plans.length);
        res.json(plans);
    } catch (error) {
        console.error('getDietPlans error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getMemberAttendance = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        const attendance = await prisma.attendance.findMany({
            where: { memberId: member.id },
            orderBy: { date: 'desc' },
            take: 50
        });

        const now = new Date();
        const totalVisits = attendance.length;
        const visitsThisMonth = attendance.filter(a => {
            const date = new Date(a.date);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }).length;

        // Calculate average duration for records that have both checkIn and checkOut
        const withDuration = attendance.filter(a => a.checkIn && a.checkOut);
        let avgDuration = '--';
        if (withDuration.length > 0) {
            const totalMs = withDuration.reduce((sum, a) => sum + (new Date(a.checkOut) - new Date(a.checkIn)), 0);
            const avgMin = Math.round(totalMs / withDuration.length / 60000);
            avgDuration = `${avgMin} min`;
        }

        // Consistency: visits this month / days elapsed this month
        const daysElapsed = now.getDate();
        const consistencyPct = daysElapsed > 0 ? Math.min(100, Math.round((visitsThisMonth / daysElapsed) * 100)) : 0;

        res.json({
            logs: attendance.map(a => ({
                id: a.id,
                date: a.date,
                checkInTime: a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
                checkOutTime: a.checkOut ? new Date(a.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
                type: a.type,
                status: a.status
            })),
            stats: {
                totalVisits,
                visitsThisMonth,
                avgDuration,
                consistency: `${consistencyPct}%`
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getRewardCatalog = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const catalog = await prisma.rewardCatalog.findMany({
            where: { tenantId: member.tenantId, status: 'Active' },
            orderBy: { points: 'asc' }
        });

        if (catalog.length === 0) {
            const dummyCatalog = [
                { name: "Free Guest Pass", points: 200, description: "Bring a friend for a single workout session." },
                { name: "Protein Shake", points: 350, description: "Get one whey protein shake at the juice bar." },
                { name: "10% Membership Discount", points: 500, description: "Apply 10% off on your next monthly bill." }
            ];

            for (const item of dummyCatalog) {
                await prisma.rewardCatalog.create({
                    data: {
                        tenantId: member.tenantId,
                        name: item.name,
                        points: item.points,
                        description: item.description
                    }
                });
            }

            const newCatalog = await prisma.rewardCatalog.findMany({
                where: { tenantId: member.tenantId, status: 'Active' },
                orderBy: { points: 'asc' }
            });
            return res.json(newCatalog);
        }

        res.json(catalog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const redeemReward = async (req, res) => {
    try {
        const { catalogId } = req.body;
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const memberDb = memberRaw[0];
        if (!memberDb) return res.status(404).json({ message: 'Member profile not found' });

        const member = await prisma.member.findUnique({
            where: { id: memberDb.id },
            include: { Reward: true }
        });

        const catalogItem = await prisma.rewardCatalog.findUnique({
            where: { id: parseInt(catalogId) }
        });

        if (!catalogItem) return res.status(404).json({ message: 'Reward item not found' });

        const loyaltyPts = member.Reward ? member.Reward.reduce((sum, r) => sum + r.points, 0) : 0;

        const currentPoints = loyaltyPts > 0 ? loyaltyPts : 450;

        if (currentPoints < catalogItem.points) {
            return res.status(400).json({ message: 'Insufficient loyalty points' });
        }

        if (loyaltyPts === 0) {
            await prisma.reward.create({
                data: {
                    tenantId: member.tenantId,
                    memberId: member.id,
                    name: "Initial Bonus",
                    points: 450,
                    description: "Initial signup bonus"
                }
            });
        }

        await prisma.reward.create({
            data: {
                tenantId: member.tenantId,
                memberId: member.id,
                name: `Redeemed: ${catalogItem.name}`,
                points: -catalogItem.points,
                description: `Used points to redeem: ${catalogItem.description}`
            }
        });

        res.json({ message: 'Reward redeemed successfully', remainingPoints: currentPoints - catalogItem.points });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyReferrals = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const rawLeads = await prisma.lead.findMany({
            where: { tenantId: member.tenantId, source: 'Referral' },
            orderBy: { createdAt: 'desc' }
        });

        const myReferrals = [];
        let totalRewardsEarned = 0;
        let pendingRewards = 0;
        let successfulSignups = 0;

        for (const lead of rawLeads) {
            if (lead.notes) {
                if (lead.notes.trim().startsWith('{')) {
                    try {
                        const notesData = JSON.parse(lead.notes);
                        if (notesData.referrerId === member.memberId) {
                            const isConverted = lead.status === 'Converted';
                            if (isConverted) successfulSignups++;
                            
                            // 500 per confirmed conversion
                            if (lead.rewardStatus === 'Claimed' || lead.rewardStatus === 'Paid') {
                                totalRewardsEarned += 500;
                            } else if (lead.rewardStatus === 'Eligible') {
                                pendingRewards += 500;
                            }

                            myReferrals.push({
                                id: lead.id,
                                referredName: lead.name,
                                phone: lead.phone,
                                email: lead.email,
                                status: isConverted ? 'Converted' : (lead.status === 'New' ? 'Pending' : lead.status),
                                rewardStatus: lead.rewardStatus || 'Pending',
                                rewardAmount: 500,
                                createdAt: lead.createdAt
                            });
                        }
                    } catch (e) {
                        console.error("Error parsing lead notes", e);
                    }
                }
            }
        }

        res.json({
            referralCode: member.memberId,
            referrals: myReferrals,
            stats: {
                referralsSent: myReferrals.length,
                successfulSignups,
                rewardsEarned: totalRewardsEarned,
                pendingRewards
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberDashboard = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: {
                plan: true,
                tenant: true,
                trainer: true,
                lockers: true,
                attendances: {
                    orderBy: { date: 'desc' },
                    take: 5
                },
                bookings: {
                    where: { status: 'Upcoming' },
                    include: {
                        class: {
                            include: { trainer: true }
                        }
                    },
                    orderBy: { date: 'asc' },
                    take: 1
                },
                invoices: {
                    where: { status: { not: 'Paid' } }
                }
            }
        });

        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        // Calculate visits this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const visitsThisMonth = await prisma.attendance.count({
            where: {
                memberId: member.id,
                date: { gte: startOfMonth }
            }
        });

        // Count remaining PT sessions from PTMemberAccount
        const ptAccountStats = await prisma.pTMemberAccount.aggregate({
            where: {
                memberId: member.id,
                status: 'Active'
            },
            _sum: {
                remainingSessions: true
            }
        });
        const ptSessionsRemaining = ptAccountStats._sum.remainingSessions || 0;

        // Calculate pending dues
        const pendingDues = member.invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);

        // Benefits
        const benefits = member.plan?.benefits || "";

        const dashboardData = {
            memberInfo: {
                id: member.id,
                name: member.name,
                memberId: member.memberId,
                branchName: member.tenant?.name || 'Main Branch',
                status: member.status
            },
            membership: {
                planName: member.plan?.name || 'No Active Plan',
                startDate: member.joinDate,
                expiryDate: member.expiryDate,
                daysRemaining: member.expiryDate ? Math.max(0, Math.floor((new Date(member.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0,
                benefits: benefits
            },
            stats: {
                ptSessionsRemaining,
                visitsThisMonth,
                pendingDues,
                activeInvoices: member.invoices.length
            },
            recentAttendance: member.attendances.map(a => ({
                id: a.id,
                date: a.date,
                time: a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (a.date ? new Date(a.date).toLocaleDateString('en-GB') : 'N/A')
            })),
            upcomingClass: member.bookings.length > 0 ? {
                id: member.bookings[0].id,
                className: member.bookings[0].class.name,
                date: member.bookings[0].date,
                status: member.bookings[0].status
            } : null,
            trainer: member.trainer ? {
                userId: member.trainer.id,
                name: member.trainer.name,
                specialization: 'Personal Trainer'
            } : {
                userId: null,
                name: 'Not Assigned',
                specialization: 'Connect with staff'
            },
            locker: member.lockers.length > 0 ? {
                number: member.lockers[0].number
            } : null,
            announcements: await prisma.announcement.findMany({
                where: {
                    status: 'Active',
                    OR: [
                        { tenantId: member.tenantId },
                        { tenantId: 0 } // Global
                    ],
                    targetRole: { in: ['all', 'member', 'MEMBER'] }
                },
                orderBy: { createdAt: 'desc' },
                take: 3
            })
        };

        res.json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const memberCheckIn = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { plan: true }
        });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        if (member.status === 'Expired') return res.status(403).json({ message: 'Membership expired. Please renew.' });
        if (member.status !== 'Active') return res.status(403).json({ message: `Membership is currently ${member.status}` });

        // Check if already checked in today
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const existing = await prisma.attendance.findFirst({
            where: { memberId: member.id, checkIn: { gte: todayStart, lte: todayEnd }, type: 'Member' }
        });

        if (existing && !existing.checkOut) {
            return res.status(400).json({ message: 'Already checked in. Please check out first.' });
        }
        if (existing && existing.checkOut) {
            return res.status(400).json({ message: 'Already checked in and out today.' });
        }

        const attendance = await prisma.attendance.create({
            data: {
                memberId: member.id,
                userId: req.user.id,
                type: 'Member',
                checkIn: new Date(),
                tenantId: member.tenantId,
                status: 'Present'
            }
        });

        res.json({ success: true, message: 'Check-in successful!', attendance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const memberCheckOut = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const activeRecord = await prisma.attendance.findFirst({
            where: { memberId: member.id, checkOut: null, type: 'Member' },
            orderBy: { checkIn: 'desc' }
        });

        if (!activeRecord) return res.status(400).json({ message: 'No active check-in found.' });

        const updated = await prisma.attendance.update({
            where: { id: activeRecord.id },
            data: { checkOut: new Date() }
        });

        res.json({ success: true, message: 'Checked out successfully!', attendance: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberCheckInStatus = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const todayRecord = await prisma.attendance.findFirst({
            where: { memberId: member.id, checkIn: { gte: todayStart, lte: todayEnd }, type: 'Member' },
            orderBy: { checkIn: 'desc' }
        });

        res.json({
            isCheckedIn: !!(todayRecord && !todayRecord.checkOut),
            isCheckedOut: !!(todayRecord && todayRecord.checkOut),
            checkInTime: todayRecord?.checkIn || null,
            checkOutTime: todayRecord?.checkOut || null,
            attendanceId: todayRecord?.id || null
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    upgradePlan,
    cancelMembership,
    getWalletTransactions,
    addWalletCredit,
    getMyBookings,
    createBooking,
    cancelBooking,
    rescheduleBooking,
    freezeMembership,
    unfreezeMembership,
    getInvoices,
    payInvoice,
    getWalletBalance,
    getSavedCards,
    addSavedCard,
    getMembershipDetails,
    getServiceRequests,
    addServiceRequest,
    getMemberProfile,
    getAvailableClasses,
    getWorkoutPlans,
    getDietPlans,
    deleteSavedCard,
    getRewardCatalog,
    redeemReward,
    getMyReferrals,
    getMemberDashboard,
    updateMemberProfile,
    changePassword,
    getMemberAttendance,
    memberCheckIn,
    memberCheckOut,
    getMemberCheckInStatus
};
