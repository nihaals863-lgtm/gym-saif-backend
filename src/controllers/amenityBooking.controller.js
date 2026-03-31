const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Book an amenity slot
const bookAmenity = async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const { amenityId, slotId, date } = req.body;

        // 1. Get Member Info
        const member = await prisma.member.findFirst({
            where: { userId: parseInt(userId) },
            include: { plan: true }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // 2. Get Amenity and Slot Info
        const amenity = await prisma.amenity.findUnique({
            where: { id: parseInt(amenityId) },
            include: { slots: true }
        });

        if (!amenity || amenity.status !== 'Active') {
            return res.status(404).json({ message: 'Amenity not found or inactive' });
        }

        // 3. Branch Check
        if (amenity.tenantId !== member.tenantId) {
            return res.status(403).json({ message: 'This amenity is not available in your branch' });
        }

        // 4. Gender Check
        if (amenity.gender !== 'UNISEX') {
            if (member.gender && member.gender.toUpperCase() !== amenity.gender) {
                return res.status(403).json({ message: `This amenity is only available for ${amenity.gender} members` });
            }
        }

        // 5. Slot Capacity Check (if slots are enabled)
        let targetSlot = null;
        if (amenity.slotEnabled) {
            if (!slotId) return res.status(400).json({ message: 'Slot ID is required for this amenity' });
            
            targetSlot = await prisma.amenitySlot.findUnique({
                where: { id: parseInt(slotId) }
            });

            if (!targetSlot || targetSlot.amenityId !== amenity.id) {
                return res.status(400).json({ message: 'Invalid slot selection' });
            }

            // Check current bookings for this slot on this date
            const bookingCount = await prisma.amenityBooking.count({
                where: {
                    slotId: targetSlot.id,
                    date: new Date(date),
                    status: 'Booked'
                }
            });

            if (bookingCount >= targetSlot.capacity) {
                return res.status(400).json({ message: 'This slot is already full' });
            }
        }

        // 6. Usage Limit Check
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        // Get current month usage
        let usage = await prisma.amenityUsage.findUnique({
            where: {
                memberId_amenityId_month_year: {
                    memberId: member.id,
                    amenityId: amenity.id,
                    month: currentMonth,
                    year: currentYear
                }
            }
        });

        // Determine Limit from Plan Benefits
        // Supports both formats:
        // Format 1 (new): [{"id": 2, "limit": "5"}] - array with amenity IDs
        // Format 2 (old): {"Steam Bath": 3} - object with amenity names
        let limit = 0;
        try {
            if (member.plan && member.plan.benefits) {
                const benefits = JSON.parse(member.plan.benefits);
                if (Array.isArray(benefits)) {
                    const match = benefits.find(b => b && parseInt(b.id) === amenity.id);
                    if (match) limit = parseInt(match.limit) || 0;
                } else if (typeof benefits === 'object' && benefits !== null) {
                    if (benefits[amenity.name] !== undefined) {
                        limit = parseInt(benefits[amenity.name]);
                    }
                }
            }
        } catch (e) {
            console.error("Benefit parse error:", e);
        }

        const currentUsed = usage ? usage.usedCount : 0;
        let requiresPayment = false;
        let amountToPay = 0;

        if (limit > 0 && currentUsed >= limit) {
            requiresPayment = true;
            amountToPay = amenity.extraPrice || 0;
            
            if (amountToPay <= 0) {
                return res.status(403).json({ 
                    message: `You have reached your monthly limit of ${limit} sessions for ${amenity.name}.`,
                    limitExceeded: true
                });
            }
        }

        // 7. If requires payment, return payment info (Frontend will handle Razorpay)
        if (requiresPayment) {
            return res.json({
                message: 'Limit exceeded. Extra payment required.',
                requiresPayment: true,
                amount: amountToPay,
                amenityName: amenity.name
            });
        }

        // 8. Create Booking
        const booking = await prisma.amenityBooking.create({
            data: {
                memberId: member.id,
                amenityId: amenity.id,
                slotId: targetSlot ? targetSlot.id : null,
                date: new Date(date),
                status: 'Booked',
                paymentStatus: 'None'
            }
        });

        // 9. Update Usage
        if (usage) {
            await prisma.amenityUsage.update({
                where: { id: usage.id },
                data: { usedCount: { increment: 1 }, limit }
            });
        } else {
            await prisma.amenityUsage.create({
                data: {
                    memberId: member.id,
                    amenityId: amenity.id,
                    month: currentMonth,
                    year: currentYear,
                    usedCount: 1,
                    limit
                }
            });
        }

        res.status(201).json({
            message: 'Amenity booked successfully',
            booking
        });

    } catch (error) {
        console.error('[bookAmenity] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get all bookings for current member
const getMyBookings = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const member = await prisma.member.findFirst({
            where: { userId: parseInt(userId) }
        });

        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const bookings = await prisma.amenityBooking.findMany({
            where: { memberId: member.id },
            include: {
                amenity: true,
                slot: true
            },
            orderBy: { date: 'desc' }
        });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get available slots for a specific date (for member benefit booking)
const getAvailableSlots = async (req, res) => {
    try {
        const { id: userId, tenantId: userTenantId } = req.user;
        const { date } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        if (!date) return res.status(400).json({ message: 'Date is required' });

        // Get member info with plan
        const member = await prisma.member.findFirst({
            where: { userId: parseInt(userId) },
            include: { plan: true }
        });

        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        // Use member's tenantId, fallback to header, then user's tenantId
        let effectiveTenantId = member.tenantId;
        if (!effectiveTenantId && headerTenantId && headerTenantId !== 'all' && headerTenantId !== 'undefined') {
            effectiveTenantId = parseInt(headerTenantId);
        }
        if (!effectiveTenantId) {
            effectiveTenantId = userTenantId;
        }

        console.log('[getAvailableSlots] Debug:', {
            userId,
            memberId: member.id,
            memberTenantId: member.tenantId,
            headerTenantId,
            userTenantId,
            effectiveTenantId,
            date,
            hasPlan: !!member.plan,
            planName: member.plan?.name,
            planBenefitsRaw: member.plan?.benefits ? member.plan.benefits.substring(0, 200) : 'none'
        });

        // Build amenity query - try with tenantId first, if no results try without
        let amenities = [];
        if (effectiveTenantId) {
            amenities = await prisma.amenity.findMany({
                where: {
                    tenantId: parseInt(effectiveTenantId),
                    status: 'Active'
                },
                include: { slots: true }
            });
        }

        // Fallback: if no amenities found with tenantId, get all active amenities
        if (amenities.length === 0) {
            console.log('[getAvailableSlots] No amenities for tenantId', effectiveTenantId, '- trying all active amenities');
            amenities = await prisma.amenity.findMany({
                where: { status: 'Active' },
                include: { slots: true }
            });
        }

        console.log('[getAvailableSlots] Found amenities:', amenities.length, amenities.map(a => ({
            id: a.id,
            name: a.name,
            tenantId: a.tenantId,
            slotEnabled: a.slotEnabled,
            slotsCount: a.slots?.length,
            gender: a.gender
        })));

        // Filter by gender (be lenient - if member gender not set, show all)
        const filteredAmenities = amenities.filter(a => {
            if (a.gender === 'UNISEX') return true;
            if (!member.gender) return true;
            return member.gender.toUpperCase() === a.gender;
        });

        console.log('[getAvailableSlots] After gender filter:', filteredAmenities.length);

        // Get bookings for the requested date
        const bookingDate = new Date(date + 'T00:00:00.000Z');
        const bookings = await prisma.amenityBooking.findMany({
            where: {
                date: bookingDate,
                status: 'Booked',
                amenityId: { in: filteredAmenities.map(a => a.id) }
            }
        });

        // Get member's bookings for this date
        const myBookings = await prisma.amenityBooking.findMany({
            where: {
                memberId: member.id,
                date: bookingDate,
                status: 'Booked'
            }
        });

        const myBookedSlotIds = new Set(myBookings.map(b => b.slotId));
        // For walk-in amenities (no slots), track by amenityId
        const myBookedAmenityIds = new Set(myBookings.filter(b => !b.slotId).map(b => b.amenityId));

        // Parse member benefits from plan
        // Benefits can be stored in 2 formats:
        // Format 1 (new): [{"id": 2, "limit": "5"}, {"id": 3, "limit": "3"}] - array with amenity IDs
        // Format 2 (old): {"Steam Bath": 3, "Swimming Pool": 0} - object with amenity names
        let planBenefitsByAmenityId = {}; // amenityId -> limit
        try {
            if (member.plan && member.plan.benefits) {
                const raw = member.plan.benefits;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                console.log('[getAvailableSlots] Plan benefits raw:', parsed);

                if (Array.isArray(parsed)) {
                    // Format 1: [{"id": 2, "limit": "5"}]
                    parsed.forEach(b => {
                        if (b && b.id) {
                            planBenefitsByAmenityId[parseInt(b.id)] = parseInt(b.limit) || 0;
                        }
                    });
                } else if (typeof parsed === 'object' && parsed !== null) {
                    // Format 2: {"Luxury Sauna": 3} - map name to amenity ID
                    for (const [name, limit] of Object.entries(parsed)) {
                        const matchedAmenity = filteredAmenities.find(a => a.name === name);
                        if (matchedAmenity) {
                            planBenefitsByAmenityId[matchedAmenity.id] = parseInt(limit) || 0;
                        }
                    }
                }
                console.log('[getAvailableSlots] Parsed benefits by amenityId:', planBenefitsByAmenityId);
            }
        } catch (e) {
            console.error("Benefit parse error:", e);
        }

        // Get current month usage
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        const usages = await prisma.amenityUsage.findMany({
            where: {
                memberId: member.id,
                month: currentMonth,
                year: currentYear,
                amenityId: { in: filteredAmenities.map(a => a.id) }
            }
        });

        const usageMap = {};
        usages.forEach(u => { usageMap[u.amenityId] = u.usedCount; });

        // Build response with availability info
        const result = filteredAmenities.map(amenity => {
            const limit = planBenefitsByAmenityId[amenity.id] !== undefined ? planBenefitsByAmenityId[amenity.id] : 0;
            const used = usageMap[amenity.id] || 0;

            let slots = [];
            if (amenity.slotEnabled && amenity.slots && amenity.slots.length > 0) {
                // Slot-based amenity
                slots = amenity.slots.map(slot => {
                    const booked = bookings.filter(b => b.slotId === slot.id).length;
                    return {
                        id: slot.id,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        capacity: slot.capacity,
                        booked,
                        available: slot.capacity - booked,
                        isFull: booked >= slot.capacity,
                        isMyBooking: myBookedSlotIds.has(slot.id)
                    };
                });
            }

            return {
                id: amenity.id,
                name: amenity.name,
                description: amenity.description,
                icon: amenity.icon,
                gender: amenity.gender,
                extraPrice: parseFloat(amenity.extraPrice) || 0,
                slotEnabled: amenity.slotEnabled,
                monthlyLimit: limit,
                monthlyUsed: used,
                limitExceeded: limit > 0 && used >= limit,
                isWalkIn: !amenity.slotEnabled || (amenity.slots && amenity.slots.length === 0),
                isBookedToday: myBookedAmenityIds.has(amenity.id),
                slots // includes full slots too so frontend can show them as disabled
            };
        });

        // Count available slots
        const totalSlots = result.reduce((sum, a) => {
            if (a.isWalkIn) return sum + 1; // walk-in counts as 1
            return sum + a.slots.filter(s => !s.isFull).length;
        }, 0);

        console.log('[getAvailableSlots] Response:', {
            totalAmenities: result.length,
            totalSlots,
            amenityNames: result.map(a => a.name)
        });

        // Return ALL amenities, don't filter out empty ones
        res.json({
            date,
            totalSlots,
            amenities: result,
            myBookings: myBookings.length
        });

    } catch (error) {
        console.error('[getAvailableSlots] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Cancel an amenity booking
const cancelAmenityBooking = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { bookingId } = req.params;

        const member = await prisma.member.findFirst({
            where: { userId: parseInt(userId) }
        });

        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const booking = await prisma.amenityBooking.findFirst({
            where: {
                id: parseInt(bookingId),
                memberId: member.id,
                status: 'Booked'
            }
        });

        if (!booking) return res.status(404).json({ message: 'Booking not found or already cancelled' });

        // Cancel booking
        await prisma.amenityBooking.update({
            where: { id: booking.id },
            data: { status: 'Cancelled' }
        });

        // Decrement usage count
        const bookingDate = new Date(booking.date);
        const month = bookingDate.getMonth() + 1;
        const year = bookingDate.getFullYear();

        const usage = await prisma.amenityUsage.findUnique({
            where: {
                memberId_amenityId_month_year: {
                    memberId: member.id,
                    amenityId: booking.amenityId,
                    month,
                    year
                }
            }
        });

        if (usage && usage.usedCount > 0) {
            await prisma.amenityUsage.update({
                where: { id: usage.id },
                data: { usedCount: { decrement: 1 } }
            });
        }

        res.json({ message: 'Booking cancelled successfully' });

    } catch (error) {
        console.error('[cancelAmenityBooking] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    bookAmenity,
    getMyBookings,
    getAvailableSlots,
    cancelAmenityBooking
};
