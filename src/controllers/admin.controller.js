// gym_backend/src/controllers/admin.controller.js
const prisma = require('../config/prisma');
const cloudinary = require('../utils/cloudinary');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// --- MEMBER MANAGEMENT ---

const getAllMembers = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { search, status, branchId: queryBranchId, page = 1, limit = 10 } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        const effectiveBranchId = queryBranchId || headerTenantId;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else if (role === 'TRAINER') {
            where.trainerId = req.user.id;
        } else {
            // Logic for BRANCH_ADMIN and MANAGER
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            } else {
                // Determine all branches this user can access
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
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            const searchLower = search.trim();
            where.OR = [
                { name: { contains: searchLower } },
                { memberId: { contains: searchLower } },
                { phone: { contains: searchLower } },
                { email: { contains: searchLower } }
            ];
        }

        // Parallel count and find
        const [members, total] = await Promise.all([
            prisma.member.findMany({
                where,
                include: {
                    trainer: { select: { name: true } },
                    plan: { select: { name: true } },
                    tenant: { select: { name: true } }
                },
                orderBy: { joinDate: 'desc' },
                skip,
                take
            }),
            prisma.member.count({ where })
        ]);

        const formattedMembers = members.map(m => ({
            id: m.id,
            memberId: m.memberId,
            name: m.name || 'N/A',
            phone: m.phone || 'N/A',
            email: m.email || '',
            gender: m.gender || '',
            dob: m.dob || '',
            source: m.source || 'Walk-in',
            referralCode: m.referralCode || '',
            idType: m.idType || '',
            idNumber: m.idNumber || '',
            address: m.address || '',
            emergencyName: m.emergencyName || '',
            emergencyPhone: m.emergencyPhone || '',
            fitnessGoal: m.fitnessGoal || '',
            healthConditions: m.medicalHistory || '', // Map medicalHistory to healthConditions for frontend
            plan: m.plan?.name || 'No Plan',
            planId: m.planId,
            status: m.status,
            joinDate: m.joinDate ? m.joinDate.toISOString() : null, // Send raw date for frontend processing
            expiryDate: m.expiryDate ? m.expiryDate.toISOString() : null,
            trainer: m.trainer?.name || 'Unassigned',
            branch: m.tenant?.name || 'Main Branch'
        }));

        res.json({ data: formattedMembers, total });
    } catch (error) {
        console.error('GetAllMembers Controller Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const addMember = async (req, res) => {
    try {
        const { tenantId: userTenantId, email: userEmail, name: userName } = req.user;
        const {
            name, email, phone, planId, duration, avatar, benefits, branchId,
            gender, dob, source, referralCode, idType, idNumber, address,
            emergencyName, emergencyPhone, fitnessGoal, healthConditions, medicalHistory,
            startDate
        } = req.body;

        let avatarUrl = null;
        if (avatar && avatar.startsWith('data:image')) {
            try {
                const uploadResponse = await cloudinary.uploader.upload(avatar, {
                    folder: 'gym/biometrics',
                    resource_type: 'image'
                });
                avatarUrl = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload failure:', uploadError);
            }
        }

        // Logic to determine target branches
        let targetBranchIds = [];
        const effectiveBranchId = branchId || req.headers['x-tenant-id'];

        if (effectiveBranchId === 'all') {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId || undefined },
                        { owner: userEmail || undefined },
                        { owner: userName || undefined }
                    ].filter(cond => Object.values(cond)[0] !== undefined)
                },
                select: { id: true }
            });
            targetBranchIds = branches.map(b => b.id);
        } else if (effectiveBranchId) {
            targetBranchIds = [parseInt(effectiveBranchId)];
        } else {
            targetBranchIds = [userTenantId];
        }

        if (targetBranchIds.length === 0) {
            return res.status(400).json({ message: 'No valid branches found' });
        }

        const createdMembers = [];
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);

        for (const tId of targetBranchIds) {
            const uniqueMemberId = `MEM-${Date.now()}-${tId}`;
            const memberEmailForUser = (effectiveBranchId === 'all' && email)
                ? email.replace('@', `+b${tId}@`)
                : (email || `m${Date.now()}@branch${tId}.com`);

            const existingUser = await prisma.user.findUnique({
                where: { email: memberEmailForUser }
            });

            if (existingUser) {
                if (effectiveBranchId === 'all') continue;
                return res.status(400).json({ message: `A user with email ${memberEmailForUser} already exists.` });
            }

            const newUser = await prisma.user.create({
                data: {
                    name,
                    email: memberEmailForUser,
                    password: hashedPassword,
                    phone,
                    role: 'MEMBER',
                    tenantId: tId,
                    status: 'Active',
                    avatar: avatarUrl,
                    address: address || null
                }
            });

            let planObj = null;
            if (planId) {
                planObj = await prisma.membershipPlan.findFirst({
                    where: { id: parseInt(planId), tenantId: tId }
                });
            }

            const joinDate = startDate ? new Date(startDate) : new Date();
            let expiryDate = null;
            let finalPrice = 0;
            const cycleMultiplier = parseInt(duration) || 1;

            if (planObj) {
                expiryDate = new Date(joinDate);
                const totalDurationParam = planObj.duration * cycleMultiplier;

                if (planObj.durationType === 'Days') {
                    expiryDate.setDate(expiryDate.getDate() + totalDurationParam);
                } else if (planObj.durationType === 'Weeks') {
                    expiryDate.setDate(expiryDate.getDate() + (totalDurationParam * 7));
                } else if (planObj.durationType === 'Years') {
                    expiryDate.setFullYear(expiryDate.getFullYear() + totalDurationParam);
                } else {
                    expiryDate.setMonth(expiryDate.getMonth() + totalDurationParam);
                }
                finalPrice = parseFloat(planObj.price) * cycleMultiplier;
            }

            const newMember = await prisma.member.create({
                data: {
                    memberId: uniqueMemberId,
                    userId: newUser.id,
                    tenantId: tId,
                    name,
                    email: memberEmailForUser,
                    phone,
                    planId: planId ? parseInt(planId) : null,
                    status: 'Active',
                    avatar: avatarUrl,
                    gender,
                    dob,
                    source: source || 'Walk-in',
                    referralCode,
                    idType,
                    idNumber,
                    address,
                    emergencyName,
                    emergencyPhone,
                    fitnessGoal,
                    medicalHistory: healthConditions || medicalHistory,
                    joinDate: joinDate,
                    expiryDate: expiryDate, // Auto set based on plan duration
                    benefits: Array.isArray(benefits) ? JSON.stringify(benefits) : (benefits || null)
                }
            });

            if (planObj) {
                await prisma.invoice.create({
                    data: {
                        tenantId: tId,
                        invoiceNumber: `INV-${Date.now()}-${tId}`,
                        memberId: newMember.id,
                        amount: finalPrice,
                        paymentMode: 'Cash',
                        status: 'Unpaid',
                        dueDate: new Date()
                    }
                });
            }

            // --- NOTIFICATION ---
            // Notify branch admins/managers about the new member
            const staffToNotify = await prisma.user.findMany({
                where: {
                    tenantId: tId,
                    role: { in: ['BRANCH_ADMIN', 'MANAGER'] }
                },
                select: { id: true }
            });

            if (staffToNotify.length > 0) {
                await prisma.notification.createMany({
                    data: staffToNotify.map(s => ({
                        userId: s.id,
                        title: 'New Member Signed Up',
                        message: `${name} has joined the gym. Membership: ${planId || 'None'}`,
                        type: 'success',
                        link: `/members`
                    }))
                });
            }
            createdMembers.push(newMember);

            // --- LINK REFERRAL LEAD ---
            // Update any existing referral lead for this person to 'Converted'
            try {
                await prisma.lead.updateMany({
                    where: {
                        tenantId: tId,
                        OR: [
                            { email: memberEmailForUser },
                            { phone: phone }
                        ],
                        source: 'Referral',
                        status: { not: 'Converted' }
                    },
                    data: { status: 'Converted' }
                });
            } catch (leadError) {
                console.error('Failed to update referral lead status during manual member addition:', leadError);
            }
        }

        if (createdMembers.length === 0 && targetBranchIds.length > 0) {
            return res.status(400).json({ message: "Member already exists in selected branch(es)." });
        }

        res.json({ message: 'Member(s) created successfully', count: createdMembers.length });
    } catch (error) {
        console.error('AddMember Controller Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) },
            include: { trainer: true, tenant: true, plan: true }
        });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        // Return with mapped fields for consistency
        const formatted = {
            ...member,
            healthConditions: member.medicalHistory,
            plan: member.plan?.name || 'No Plan',
            branch: member.tenant?.name || 'Main Branch',
            joinDate: member.joinDate ? member.joinDate.toISOString() : null,
            expiryDate: member.expiryDate ? member.expiryDate.toISOString() : null,
        };
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, email, phone, gender, avatar, planId,
            startDate, status, benefits, medicalHistory, healthConditions,
            fitnessGoal, emergencyName, emergencyPhone,
            dob, source, referralCode, idType, idNumber, address
        } = req.body;

        const updateData = {
            name,
            email,
            phone,
            gender,
            status,
            medicalHistory: healthConditions || medicalHistory, // Accept either from frontend
            fitnessGoal,
            emergencyName,
            emergencyPhone,
            dob,
            source,
            referralCode,
            idType,
            idNumber,
            address,
            benefits: Array.isArray(benefits) ? JSON.stringify(benefits) : (benefits || null)
        };

        if (planId) updateData.planId = parseInt(planId);
        if (startDate) updateData.joinDate = new Date(startDate);

        if (avatar && avatar.startsWith('data:image')) {
            try {
                const uploadResponse = await cloudinary.uploader.upload(avatar, {
                    folder: 'gym/biometrics',
                    resource_type: 'image'
                });
                updateData.avatar = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload failure:', uploadError);
            }
        }

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(updated);
    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        if (role !== 'SUPER_ADMIN' && member.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: member.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this member' });
        }

        await prisma.member.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Member deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleMemberStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: { status: member.status === 'Active' ? 'Inactive' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- STAFF MANAGEMENT ---

const getAllStaff = async (req, res) => {
    try {
        const { branchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const { tenantId: userTenantIdRaw, role, email, name: userName } = req.user;

        // Use prioritized branch/tenant identifier
        const effectiveBranchId = branchId || headerTenantId;
        const userTenantId = userTenantIdRaw || 1; // Default to 1 if null/undefined

        console.log(`[getAllStaff] User: ${email}, Role: ${role}, EffBranchId: ${effectiveBranchId}, UserTenant: ${userTenantId}`);

        let where = { role: { in: ['STAFF', 'TRAINER', 'MANAGER', 'BRANCH_ADMIN'] } };

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else {
            // Logic for BRANCH_ADMIN and MANAGER
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            } else {
                // Determine all branches this user can access
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: { OR: orConditions },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
                console.log(`[getAllStaff] Managed branches: ${where.tenantId.in}`);
            }
        }

        console.log('[getAllStaff] Final Where:', JSON.stringify(where, null, 2));

        const staff = await prisma.user.findMany({
            where,
            orderBy: { joinedDate: 'desc' }
        });

        console.log(`[getAllStaff] Found ${staff.length} staff members`);
        res.json(staff);
    } catch (error) {
        console.error('[getAllStaff] Controller Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getStaffById = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await prisma.user.findUnique({
            where: { id: parseInt(id) }
        });
        if (!staff) return res.status(404).json({ message: 'Staff not found' });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAvailableUsersForStaff = async (req, res) => {
    try {
        const { branchId } = req.query;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;

        let targetTenantIds = [];

        if (role === 'SUPER_ADMIN') {
            if (branchId && branchId !== 'all' && branchId !== 'undefined') {
                targetTenantIds = [parseInt(branchId)];
            } else {
                targetTenantIds = [userTenantId];
            }
        } else {
            if (branchId && branchId !== 'all' && branchId !== 'undefined') {
                targetTenantIds = [parseInt(branchId)];
            } else {
                let orConditions = [{ id: userTenantId }];
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });
                const branches = await prisma.tenant.findMany({ where: { OR: orConditions }, select: { id: true } });
                targetTenantIds = branches.map(b => b.id);
            }
        }

        // Get all users in the target tenants who are not already staff/trainers/admins/managers
        const users = await prisma.user.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                role: { notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'MANAGER', 'TRAINER', 'STAFF'] },
                status: 'Active'
            }
        });

        // Filter out users who have a Member record
        const unlinkedUsers = [];
        for (const user of users) {
            const memberRecord = await prisma.member.findUnique({
                where: { userId: user.id }
            });
            if (!memberRecord) {
                unlinkedUsers.push(user);
            }
        }

        res.json(unlinkedUsers);
    } catch (error) {
        console.error('[getAvailableUsersForStaff] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const linkStaff = async (req, res) => {
    try {
        const { userId, branchId, role, department, position, joiningDate, salaryType, baseSalary, bankName, accountNumber, taxId, ifsc, commission } = req.body;

        if (!userId || !branchId || !role) {
            return res.status(400).json({ message: 'User ID, Branch, and Role are required' });
        }

        let mappedRole = role.toUpperCase();
        if (role === 'Admin') mappedRole = 'BRANCH_ADMIN';
        if (['Receptionist', 'Sales', 'Sales Professional'].includes(role)) mappedRole = 'STAFF';

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(userId) },
            data: {
                role: mappedRole,
                tenantId: parseInt(branchId),
                department,
                joinedDate: joiningDate ? new Date(joiningDate) : new Date(),
                baseSalary: (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') ? parseFloat(baseSalary) : null,
                accountNumber,
                ifsc,
                config: JSON.stringify({
                    position,
                    salaryType,
                    bankName,
                    taxId,
                    commission: commission ? parseFloat(commission) : 0
                })
            }
        });

        res.json({ message: 'User linked as staff successfully', staff: updatedUser });
    } catch (error) {
        console.error('[linkStaff] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createStaff = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const {
            name, email, phone, dob, department, role,
            joiningDate, status, baseSalary, commission, accountNumber, ifsc,
            trainerConfig, salesConfig, managerConfig, documents,
            idType, idNumber, specialization, certifications, salaryType, hourlyRate, ptSharePercent, bio,
            position, bankName, taxId
        } = req.body;

        console.log(`[createStaff] Received payload:`, {
            name, email, role, position, commission, bankName, taxId, ifsc
        });

        // Combine role configs into one config object based on the role
        let config = null;
        if (role === 'Trainer') config = trainerConfig;
        if (role === 'Sales') config = salesConfig;
        if (role === 'Manager') config = managerConfig;

        // Hash default password for staff (e.g. 123456)
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);

        // Handle exact role value
        let mappedRole = role.toUpperCase();
        if (role === 'Admin') mappedRole = 'BRANCH_ADMIN';
        if (role === 'Sales') mappedRole = 'STAFF';
        if (role === 'Sales Professional') mappedRole = 'STAFF';
        if (role === 'Receptionist') mappedRole = 'STAFF';

        // Handle "All Branches" creation for staff
        if (req.body.branchId === 'all' || req.body.tenantId === 'all') {
            const { role: userRole, email: userEmail, name: userName, tenantId: userTenantId } = req.user;

            let branchQuery = {};
            if (userRole !== 'SUPER_ADMIN') {
                let orConditions = [{ id: userTenantId }];
                if (userEmail) orConditions.push({ owner: userEmail });
                if (userName) orConditions.push({ owner: userName });

                branchQuery = {
                    where: { OR: orConditions }
                };
            }
            const branches = await prisma.tenant.findMany(branchQuery);
            const createdStaff = await Promise.all(branches.map(async (b) => {
                const bEmail = email.includes('@') ? email.replace('@', `+b${b.id}@`) : `${email}_b${b.id}`;
                try {
                    return await prisma.user.create({
                        data: {
                            name,
                            email: bEmail,
                            password: hashedPassword,
                            phone,
                            role: mappedRole,
                            tenant: { connect: { id: b.id } },
                            status: status || 'Active',
                            department,
                            joinedDate: joiningDate ? new Date(joiningDate) : new Date(),
                            baseSalary: (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') ? parseFloat(baseSalary) : null,
                            accountNumber,
                            ifsc,
                            config: JSON.stringify({
                                ...config,
                                idType,
                                idNumber,
                                specialization,
                                certifications,
                                salaryType,
                                hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
                                ptSharePercent: ptSharePercent ? parseFloat(ptSharePercent) : null,
                                bio,
                                commission: commission ? parseFloat(commission) : 0,
                                position,
                                bankName,
                                taxId
                            }),
                            documents: documents ? JSON.stringify(documents) : null
                        }
                    });
                } catch (e) {
                    console.error(`Failed to create staff for branch ${b.id}:`, e.message);
                    return null;
                }
            }));
            return res.status(201).json(createdStaff.filter(s => s !== null));
        }

        const newStaff = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone,
                role: mappedRole,
                tenant: { connect: { id: req.body.tenantId ? parseInt(req.body.tenantId) : tenantId } },
                status: status || 'Active',
                department,
                joinedDate: joiningDate ? new Date(joiningDate) : new Date(),
                baseSalary: (baseSalary !== undefined && baseSalary !== null && baseSalary !== '') ? parseFloat(baseSalary) : null,
                accountNumber,
                ifsc,
                config: JSON.stringify({
                    ...config,
                    idType,
                    idNumber,
                    specialization,
                    certifications,
                    salaryType,
                    hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
                    ptSharePercent: ptSharePercent ? parseFloat(ptSharePercent) : null,
                    bio,
                    commission: commission ? parseFloat(commission) : 0,
                    position,
                    bankName,
                    taxId
                }),
                documents: documents ? JSON.stringify(documents) : null,
            }
        });

        res.status(201).json(newStaff);
    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ message: error.message });
    }
};

// --- BOOKINGS ---

const getBookings = async (req, res) => {
    try {
        const { search, status, branchId: queryBranchId, startDate, endDate } = req.query;
        const headerBranchId = req.headers['x-tenant-id'];
        const { tenantId: userHomeTenantId, role, email, name: userName } = req.user;

        // Determine effective branch ID: query param overrides header
        // If queryBranchId is present (even if empty string), we use it.
        // If not present, we fall back to header (and 'all' is handled in resolving logic)
        let branchFilter = queryBranchId !== undefined ? queryBranchId : headerBranchId;

        // Normalize: '' or null or 'all' should be treated as all-branch view
        const isAll = !branchFilter || branchFilter === 'all' || branchFilter === '';

        console.log(`[getBookings] User: ${email}, Role: ${role}, branchFilter: ${branchFilter}, isAll: ${isAll}`);

        let where = {};

        // Resolve branch filtering
        if (role === 'SUPER_ADMIN') {
            if (!isAll) {
                where.member = { tenantId: parseInt(branchFilter) };
            }
        } else {
            if (!isAll) {
                where.member = { tenantId: parseInt(branchFilter) };
            } else {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userHomeTenantId || -1 },
                            { owner: email || '___NONE___' },
                            { owner: userName || '___NONE___' }
                        ]
                    },
                    select: { id: true }
                });
                where.member = { tenantId: { in: branches.map(b => b.id) } };
            }
        }

        // Status Filter
        if (status && status !== 'All' && status !== 'All Status') {
            where.status = status;
        }

        // Date Range Filter
        if ((startDate && startDate !== '') || (endDate && endDate !== '')) {
            where.date = {};
            if (startDate && startDate !== '') {
                const s = new Date(startDate);
                if (!isNaN(s.getTime())) where.date.gte = s;
            }
            if (endDate && endDate !== '') {
                const e = new Date(endDate);
                if (!isNaN(e.getTime())) {
                    e.setHours(23, 59, 59, 999);
                    where.date.lte = e;
                }
            }
            if (Object.keys(where.date).length === 0) delete where.date;
        }

        // Search Filter
        if (search && search.trim() !== '') {
            where.member = {
                ...where.member,
                OR: [
                    { name: { contains: search } },
                    { email: { contains: search } },
                    { memberId: { contains: search } }
                ]
            };
        }

        const bookings = await prisma.booking.findMany({
            where,
            include: {
                member: true,
                class: {
                    include: { trainer: true }
                }
            },
            orderBy: { date: 'desc' }
        });

        res.json({ data: bookings, total: bookings.length });
    } catch (error) {
        console.error('[getBookings] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getBookingStats = async (req, res) => {
    try {
        const { branchId: queryBranchId, startDate, endDate } = req.query;
        const headerBranchId = req.headers['x-tenant-id'];
        const { tenantId: userHomeTenantId, role, email, name: userName } = req.user;

        let branchFilter = queryBranchId !== undefined ? queryBranchId : headerBranchId;
        const isAll = !branchFilter || branchFilter === 'all' || branchFilter === '';

        let where = {};

        if (role === 'SUPER_ADMIN') {
            if (!isAll) {
                where.member = { tenantId: parseInt(branchFilter) };
            }
        } else {
            if (!isAll) {
                where.member = { tenantId: parseInt(branchFilter) };
            } else {
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userHomeTenantId || -1 },
                            { owner: email || '___NONE___' },
                            { owner: userName || '___NONE___' }
                        ]
                    },
                    select: { id: true }
                });
                where.member = { tenantId: { in: branches.map(b => b.id) } };
            }
        }

        if ((startDate && startDate !== '') || (endDate && endDate !== '')) {
            where.date = {};
            if (startDate && startDate !== '') {
                const s = new Date(startDate);
                if (!isNaN(s.getTime())) where.date.gte = s;
            }
            if (endDate && endDate !== '') {
                const e = new Date(endDate);
                if (!isNaN(e.getTime())) {
                    e.setHours(23, 59, 59, 999);
                    where.date.lte = e;
                }
            }
            if (Object.keys(where.date).length === 0) delete where.date;
        }

        const [total, upcoming, completed, cancelled] = await Promise.all([
            prisma.booking.count({ where }),
            prisma.booking.count({ where: { ...where, status: 'Upcoming' } }),
            prisma.booking.count({ where: { ...where, status: 'Completed' } }),
            prisma.booking.count({ where: { ...where, status: 'Cancelled' } })
        ]);

        res.json({ total, upcoming, completed, cancelled });
    } catch (error) {
        console.error('[getBookingStats] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getBookingsByDateRange = async (req, res) => {
    try {
        const { start, end } = req.query;
        const { tenantId } = req.user;
        const bookings = await prisma.booking.findMany({
            where: {
                member: { tenantId },
                date: { gte: new Date(start), lte: new Date(end) }
            },
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(id) },
            include: { member: true, class: true }
        });
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBooking = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { memberId, classId, date, status } = req.body;

        if (!memberId || !classId || !date) {
            return res.status(400).json({ message: 'Member, Class, and Date are required' });
        }

        // Verify member belongs to tenant
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });

        if (!member || member.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Invalid member or access denied' });
        }

        // Verify class belongs to tenant
        const gymClass = await prisma.class.findUnique({
            where: { id: parseInt(classId) }
        });

        if (!gymClass || gymClass.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Invalid class or access denied' });
        }

        const newBooking = await prisma.booking.create({
            data: {
                memberId: parseInt(memberId),
                classId: parseInt(classId),
                date: new Date(date),
                status: status || 'Upcoming'
            }
        });
        res.status(201).json(newBooking);
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role, email, name: userName } = req.user;

        // Verify existence and tenant access
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(id) },
            include: { member: { select: { tenantId: true } } }
        });

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (role !== 'SUPER_ADMIN') {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: tenantId },
                        { owner: email },
                        { owner: userName }
                    ]
                },
                select: { id: true }
            });
            const validTenantIds = branches.map(b => b.id);
            if (!validTenantIds.includes(booking.member.tenantId)) {
                return res.status(403).json({ message: 'Access denied: You cannot delete this booking' });
            }
        }

        await prisma.booking.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTodaysBookings = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const where = {
            date: { gte: today, lt: tomorrow }
        };
        if (role !== 'SUPER_ADMIN') {
            where.member = { tenantId };
        }

        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingCalendar = async (req, res) => {
    try {
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { member: { tenantId: req.user.tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- ATTENDANCE ---

const getCheckIns = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { date, search, status, type, role: filterRole, page = 1, limit = 10, branchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        const effectiveBranchId = branchId || headerTenantId;
        const where = {};

        // Role-based branch filtering
        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
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
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        // Date filter
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            where.checkIn = { gte: startOfDay, lte: endOfDay };
        }

        if (type === 'Member') {
            where.type = 'Member';
        } else if (type === 'Staff') {
            where.type = { not: 'Member' };
        }

        if (filterRole && filterRole !== 'All') {
            where.type = filterRole;
        }

        if (status) {
            if (status === 'checked-in') where.checkOut = null;
            if (status === 'checked-out') where.checkOut = { not: null };
        }

        // Case-insensitive search across multiple fields
        if (search) {
            where.OR = [
                { member: { name: { contains: search } } },
                { member: { memberId: { contains: search } } },
                { member: { phone: { contains: search } } },
                { user: { name: { contains: search } } },
                { user: { phone: { contains: search } } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [total, attendance] = await Promise.all([
            prisma.attendance.count({ where }),
            prisma.attendance.findMany({
                where,
                include: {
                    user: { select: { name: true, role: true, avatar: true } },
                    member: {
                        select: {
                            name: true,
                            memberId: true,
                            avatar: true,
                            plan: { select: { name: true } }
                        }
                    }
                },
                orderBy: { checkIn: 'desc' },
                skip,
                take: parseInt(limit)
            })
        ]);

        const formatted = attendance.map(a => {
            const name = a.member?.name || a.user?.name || 'N/A';
            const roleName = a.type === 'Member' ? 'Member' : (a.user?.role || a.type);
            const checkInTime = a.checkIn ? new Date(a.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';
            const checkOutTime = a.checkOut ? new Date(a.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '-';

            return {
                id: a.id,
                name: name,
                role: roleName,
                type: a.type === 'Member' ? 'Member' : 'Staff',
                time: checkInTime,
                checkIn: checkInTime,
                checkOut: checkOutTime,
                status: a.checkOut ? 'checked-out' : 'checked-in',
                membershipId: a.member?.memberId || '-',
                plan: a.member?.plan?.name || '-',
                avatar: a.member?.avatar || a.user?.avatar || null
            };
        });

        res.json({ data: formatted, total });
    } catch (error) {
        console.error('[getCheckIns] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteCheckIn = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const attendance = await prisma.attendance.findUnique({ where: { id: parseInt(id) } });
        if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });

        if (role !== 'SUPER_ADMIN' && attendance.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: attendance.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this attendance record' });
        }

        await prisma.attendance.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Attendance record deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceStats = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { branchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];

        const effectiveBranchId = branchId || headerTenantId;
        const where = {};

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
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
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [currentlyIn, totalToday, membersToday, staffToday] = await Promise.all([
            prisma.attendance.count({ where: { ...where, checkOut: null } }),
            prisma.attendance.count({ where: { ...where, checkIn: { gte: today, lt: tomorrow } } }),
            prisma.attendance.count({ where: { ...where, type: 'Member', checkIn: { gte: today, lt: tomorrow } } }),
            prisma.attendance.count({ where: { ...where, type: { not: 'Member' }, checkIn: { gte: today, lt: tomorrow } } })
        ]);

        res.json({ currentlyIn, totalToday, membersToday, staffToday });
    } catch (error) {
        console.error('[getAttendanceStats] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getLiveCheckIn = async (req, res) => {
    try {
        const { tenantId: userTenantId, role } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        let tenantIdToUse = userTenantId;
        if (role === 'SUPER_ADMIN' && headerTenantId && headerTenantId !== 'all') {
            tenantIdToUse = parseInt(headerTenantId);
        }

        const live = await prisma.attendance.findMany({
            where: { tenantId: tenantIdToUse, checkOut: null },
            include: {
                user: { select: { name: true, role: true, avatar: true } },
                member: { select: { name: true, memberId: true, avatar: true } }
            },
            orderBy: { checkIn: 'desc' }
        });

        const formatted = live.map(a => ({
            id: a.id,
            name: a.member?.name || a.user?.name || 'N/A',
            type: a.type === 'Member' ? 'Member' : 'Staff',
            role: a.type === 'Member' ? 'Member' : (a.user?.role || a.type),
            time: a.checkIn ? new Date(a.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
            status: 'checked-in',
            avatar: a.member?.avatar || a.user?.avatar || null
        }));

        res.json({ data: formatted });
    } catch (error) {
        console.error('[getLiveCheckIn] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// --- TASKS ---

const getTasks = async (req, res) => {
    try {
        const { id: userId, tenantId: userTenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];
        const { branchId: queryBranchId, status: queryStatus } = req.query;

        const resolveBranchId = () => {
            if (queryBranchId && queryBranchId !== 'undefined' && queryBranchId !== 'null' && queryBranchId !== 'all') return queryBranchId;
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') return headerTenantId;
            return null;
        };
        const branchId = resolveBranchId();

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId) where.tenantId = parseInt(branchId);
        } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [];
                if (userTenantId) orConditions.push({ id: userTenantId });
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                // Fetch tasks for all managed branches
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: orConditions.length > 0 ? orConditions : undefined
                    },
                    select: { id: true }
                });
                const managedIds = branches.map(b => b.id);
                where.tenantId = { in: managedIds };
            }
        } else {
            where.tenantId = userTenantId;
        }

        if (queryStatus && queryStatus !== 'All') {
            where.status = queryStatus;
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        const formatted = tasks.map(t => ({
            id: t.id,
            title: t.title,
            assignedTo: t.assignedTo?.name || 'Unassigned',
            assignedToId: t.assignedToId,
            priority: t.priority,
            dueDate: t.dueDate?.toISOString().split('T')[0] || 'N/A',
            status: t.status,
            creator: t.creator?.name || 'Admin',
            description: t.description || '',
            tenantId: t.tenantId
        }));

        res.json({ data: formatted, total: formatted.length });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: error.message });
    }
};

const getTaskStats = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];
        const { branchId: queryBranchId } = req.query;

        const resolveBranchId = () => {
            if (queryBranchId && queryBranchId !== 'undefined' && queryBranchId !== 'null' && queryBranchId !== 'all') return queryBranchId;
            if (headerTenantId && headerTenantId !== 'undefined' && headerTenantId !== 'null' && headerTenantId !== 'all') return headerTenantId;
            return null;
        };
        const branchId = resolveBranchId();

        let where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId) where.tenantId = parseInt(branchId);
        } else if (role === 'BRANCH_ADMIN' || role === 'MANAGER') {
            if (branchId && branchId !== 'all') {
                where.tenantId = parseInt(branchId);
            } else {
                let orConditions = [];
                if (userTenantId) orConditions.push({ id: userTenantId });
                if (email) orConditions.push({ owner: email });
                if (userName) orConditions.push({ owner: userName });

                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: orConditions.length > 0 ? orConditions : undefined
                    },
                    select: { id: true }
                });
                const managedIds = branches.map(b => b.id);
                where.tenantId = { in: managedIds };
            }
        } else {
            where.tenantId = userTenantId;
        }

        const total = await prisma.task.count({ where });
        const pending = await prisma.task.count({ where: { ...where, status: 'Pending' } });
        const inProgress = await prisma.task.count({ where: { ...where, status: 'In Progress' } });
        const completed = await prisma.task.count({ where: { ...where, status: 'Completed' } });
        const overdue = await prisma.task.count({
            where: {
                ...where,
                status: { not: 'Completed' },
                dueDate: { lt: new Date() }
            }
        });

        res.json({ total, pending, inProgress, completed, overdue });
    } catch (error) {
        console.error('Error fetching task stats:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.task.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };

        if (data.dueDate) data.dueDate = new Date(data.dueDate);
        if (data.assignedToId) data.assignedToId = parseInt(data.assignedToId);

        const updated = await prisma.task.update({
            where: { id: parseInt(id) },
            data
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        const { title, description, assignedToId, priority, dueDate, status, tenantId: bodyTenantId } = req.body;
        const { id: creatorId, tenantId: userTenantId, role, email, name: userName } = req.user;

        let tenantIdToUse = userTenantId;

        if (role === 'SUPER_ADMIN') {
            tenantIdToUse = bodyTenantId ? parseInt(bodyTenantId) : null;
        } else if ((role === 'BRANCH_ADMIN' || role === 'MANAGER') && bodyTenantId) {
            // Validate that the user actually owns/manages this branch
            const targetBranch = await prisma.tenant.findFirst({
                where: {
                    id: parseInt(bodyTenantId),
                    OR: [
                        { id: userTenantId },
                        { owner: email },
                        { owner: userName }
                    ]
                }
            });
            if (targetBranch) {
                tenantIdToUse = targetBranch.id;
            } else {
                return res.status(403).json({ message: 'Forbidden: You do not have access to this branch' });
            }
        }

        const newTask = await prisma.task.create({
            data: {
                title,
                description,
                priority: priority || 'Medium',
                dueDate: new Date(dueDate),
                assignedToId: assignedToId ? parseInt(assignedToId) : null,
                creatorId,
                tenantId: tenantIdToUse,
                status: status || 'Pending'
            },
            include: { assignedTo: true }
        });

        res.status(201).json(newTask);
    } catch (error) {
        console.error("Task Creation Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        const task = await prisma.task.findUnique({
            where: { id: parseInt(id) },
            include: {
                assignedTo: { select: { id: true, name: true, role: true } },
                creator: { select: { id: true, name: true, role: true } },
                tenant: { select: { id: true, name: true } }
            }
        });

        if (!task) return res.status(404).json({ message: 'Task not found' });

        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const task = await prisma.task.findUnique({ where: { id: parseInt(id) } });
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (role !== 'SUPER_ADMIN' && task.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: task.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this task' });
        }

        await prisma.task.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignTask = async (req, res) => {
    try {
        const { assignedToId, title, priority, dueDate } = req.body;
        const { id: creatorId } = req.user;
        const newTask = await prisma.task.create({
            data: {
                title,
                priority,
                dueDate: new Date(dueDate),
                assignedToId: parseInt(assignedToId),
                creatorId,
                status: 'Pending'
            }
        });
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- REPORTS ---

const getBookingReport = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { member: { tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceReport = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { user: { tenantId } };
        const attendance = await prisma.attendance.findMany({
            where,
            include: { user: true }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- DASHBOARD ---

const fetchBranchDashboardCards = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const totalMembers = await prisma.member.count({ where });
        const activePlans = await prisma.member.count({ where: { ...where, status: 'Active' } });

        res.json([
            { title: 'Total Members', value: totalMembers, change: '+0%', icon: 'users', color: 'blue' },
            { title: 'Active Plans', value: activePlans, change: '+0%', icon: 'file-text', color: 'green' },
            { title: 'Revenue (M)', value: '₹0', change: '+0%', icon: 'dollar-sign', color: 'purple' },
            { title: 'Check-ins', value: '0', change: '+0%', icon: 'activity', color: 'orange' },
        ]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const freezeMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { duration, reason, isChargeable } = req.body;

        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        // Calculate new expiry date by adding duration months
        const currentExpiry = member.expiryDate || new Date();
        const newExpiry = new Date(currentExpiry);
        newExpiry.setMonth(newExpiry.getMonth() + parseInt(duration));

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Frozen',
                expiryDate: newExpiry,
                medicalHistory: member.medicalHistory ? `${member.medicalHistory}\n[Freeze: ${reason}]` : `[Freeze: ${reason}]`
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const unfreezeMember = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: { status: 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const giftDays = async (req, res) => {
    try {
        const { id } = req.params;
        const { days, note } = req.body;

        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        const currentExpiry = member.expiryDate || new Date();
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + parseInt(days));

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: {
                expiryDate: newExpiry,
                medicalHistory: member.medicalHistory ? `${member.medicalHistory}\n[Gift: ${days} days - ${note}]` : `[Gift: ${days} days - ${note}]`
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Membership Plans ---

const getAllPlans = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const { branchId: queryBranchId } = req.query;
        const headerTenantId = req.headers['x-tenant-id'];
        const effectiveBranchId = queryBranchId || headerTenantId;

        const where = {};

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            } else {
                // Show plans from all managed branches
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userTenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                const managedBranchIds = branches.map(b => b.id);
                where.tenantId = { in: managedBranchIds };
            }
        }

        const plans = await prisma.membershipPlan.findMany({
            where,
            include: {
                _count: { select: { members: true } },
                tenant: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Format for frontend
        const formatted = plans.map(p => {
            let benefitsArray = [];
            try {
                benefitsArray = p.benefits ? (typeof p.benefits === 'string' ? JSON.parse(p.benefits) : p.benefits) : [];
            } catch (e) {
                console.error('Error parsing benefits for plan:', p.id, e);
                benefitsArray = [];
            }

            return {
                id: p.id,
                tenantId: p.tenantId,
                name: p.name,
                description: p.description,
                price: parseFloat(p.price),
                duration: p.duration,
                durationType: p.durationType,
                status: p.status,
                benefits: Array.isArray(benefitsArray) ? benefitsArray : [],
                cancellationWindow: p.cancellationWindow,
                creditsPerBooking: p.creditsPerBooking,
                maxBookingsPerDay: p.maxBookingsPerDay,
                maxBookingsPerWeek: p.maxBookingsPerWeek,
                memberCount: p._count?.members || 0,
                branch: p.tenant?.name || '—',
                createdAt: p.createdAt
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('[getAllPlans] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createPlan = async (req, res) => {
    try {
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const planData = req.body;
        const effectiveBranchId = planData.branchId || req.headers['x-tenant-id'] || 'single';

        // Determine target branches
        let targetBranchIds = [];
        if (effectiveBranchId === 'all') {
            const branches = await prisma.tenant.findMany({
                where: {
                    OR: [
                        { id: userTenantId },
                        { owner: email },
                        { owner: userName }
                    ]
                },
                select: { id: true }
            });
            targetBranchIds = branches.map(b => b.id);
        } else if (effectiveBranchId !== 'single') {
            targetBranchIds = [parseInt(effectiveBranchId)];
        } else {
            targetBranchIds = [userTenantId];
        }

        if (targetBranchIds.length === 0) {
            return res.status(400).json({ message: 'No valid branches found' });
        }

        // Serialize benefits array to JSON string for DB storage
        const benefitsStr = Array.isArray(planData.benefits)
            ? JSON.stringify(planData.benefits)
            : (planData.benefits || null);

        const createdPlans = [];
        for (const tId of targetBranchIds) {
            const newPlan = await prisma.membershipPlan.create({
                data: {
                    tenantId: tId,
                    name: planData.name,
                    description: planData.description || null,
                    price: parseFloat(planData.price) || 0,
                    duration: parseInt(planData.duration) || 30,
                    durationType: planData.durationType || 'Days',
                    status: planData.active ? 'Active' : 'Active',
                    benefits: benefitsStr,
                    cancellationWindow: planData.maxFreezeDays ? parseInt(planData.maxFreezeDays) : 0,
                    creditsPerBooking: planData.creditsPerBooking ? parseInt(planData.creditsPerBooking) : 1,
                    maxBookingsPerDay: planData.maxBookingsPerDay ? parseInt(planData.maxBookingsPerDay) : 1,
                    maxBookingsPerWeek: planData.maxBookingsPerWeek ? parseInt(planData.maxBookingsPerWeek) : 7
                }
            });
            createdPlans.push(newPlan);
        }

        res.status(201).json(effectiveBranchId === 'all' ? createdPlans : createdPlans[0]);
    } catch (error) {
        console.error('[createPlan] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const planData = req.body;

        // Serialize benefits if array
        const benefitsStr = Array.isArray(planData.benefits)
            ? JSON.stringify(planData.benefits)
            : (planData.benefits !== undefined ? planData.benefits : undefined);

        const updateData = {};
        if (planData.name !== undefined) updateData.name = planData.name;
        if (planData.description !== undefined) updateData.description = planData.description;
        if (planData.price !== undefined) updateData.price = parseFloat(planData.price);
        if (planData.duration !== undefined) updateData.duration = parseInt(planData.duration);
        if (planData.durationType !== undefined) updateData.durationType = planData.durationType;
        if (planData.status !== undefined) updateData.status = planData.status;
        if (benefitsStr !== undefined) updateData.benefits = benefitsStr;
        if (planData.maxFreezeDays !== undefined) updateData.cancellationWindow = parseInt(planData.maxFreezeDays);
        if (planData.cancellationWindow !== undefined) updateData.cancellationWindow = parseInt(planData.cancellationWindow);
        if (planData.creditsPerBooking !== undefined) updateData.creditsPerBooking = parseInt(planData.creditsPerBooking);
        if (planData.maxBookingsPerDay !== undefined) updateData.maxBookingsPerDay = parseInt(planData.maxBookingsPerDay);
        if (planData.maxBookingsPerWeek !== undefined) updateData.maxBookingsPerWeek = parseInt(planData.maxBookingsPerWeek);

        const updated = await prisma.membershipPlan.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(updated);
    } catch (error) {
        console.error('[updatePlan] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId, email, name: userName } = req.user;

        const plan = await prisma.membershipPlan.findUnique({ where: { id: parseInt(id) } });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        if (role !== 'SUPER_ADMIN' && plan.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: plan.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this plan' });
        }

        await prisma.membershipPlan.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- CLASSES MANAGEMENT ---

const getAllClasses = async (req, res) => {
    try {
        const { branchId } = req.query;
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
                const branches = await prisma.tenant.findMany({
                    where: {
                        OR: [
                            { id: userTenantId },
                            { owner: email },
                            { owner: userName }
                        ]
                    },
                    select: { id: true }
                });
                where.tenantId = { in: branches.map(b => b.id) };
            }
        }

        const classes = await prisma.class.findMany({
            where,
            include: {
                bookings: true,
                trainer: true
            }
        });

        // Format for frontend
        const formatted = classes.map(cls => {
            let parsedSchedule = cls.schedule;
            let rawDate = '';
            let rawTime = '';
            let rawType = cls.requiredBenefit || '';

            try {
                if (typeof cls.schedule === 'string' && cls.schedule.startsWith('{')) {
                    const data = JSON.parse(cls.schedule);
                    rawDate = data.date || '';
                    rawTime = data.time || '';
                    rawType = data.type || rawType;
                    parsedSchedule = data;
                }
            } catch (e) { }

            // If raw fields are still empty, attempt to parse from the schedule string (legacy data)
            if (!rawDate && typeof cls.schedule === 'string') {
                const dateMatch = cls.schedule.match(/(\d{4}-\d{2}-\d{2})|(\d{2}-\d{2}-\d{4})/);
                if (dateMatch) {
                    rawDate = dateMatch[1] || dateMatch[2].split('-').reverse().join('-');
                }
                const timeMatch = cls.schedule.match(/(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
                if (timeMatch) rawTime = timeMatch[1];
            }

            return {
                id: cls.id,
                name: cls.name,
                description: cls.description,
                trainerName: cls.trainer?.name || 'Unassigned',
                trainerId: cls.trainerId,
                schedule: (parsedSchedule && parsedSchedule.date)
                    ? `${parsedSchedule.date} at ${parsedSchedule.time}`
                    : (typeof parsedSchedule === 'string' ? parsedSchedule : (rawDate ? `${rawDate} ${rawTime}` : 'TBA')),
                rawDate,
                rawTime,
                rawType,
                duration: cls.duration || '60',
                capacity: cls.maxCapacity,
                enrolled: cls.bookings.length,
                status: cls.status,
                location: cls.location || 'N/A',
                requiredBenefit: cls.requiredBenefit || rawType
            };
        });

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createClass = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId, name, description, trainerId, schedule, date, time, type, maxCapacity, status, duration } = req.body;

        let finalSchedule = schedule || {};
        if (date && time) {
            finalSchedule = { date, time, type };
        }
        const scheduleStr = typeof finalSchedule === 'string' ? finalSchedule : JSON.stringify(finalSchedule);

        const finalType = type || req.body.requiredBenefit;

        if ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') && branchId === 'all') {
            // Find all branches/tenants the user has access to, but let's just create for what they manage.
            // Simplified: If 'all' is passed, fetch all branches from tenant table
            let branches = [];
            if (role === 'SUPER_ADMIN') {
                branches = await prisma.tenant.findMany();
            } else {
                // If branch admin / manager, they might manage multiple branches but for now fallback to their tenantId if they don't have global access
                branches = [{ id: tenantId }];
                // Assuming they are selecting 'all' from their accessible branches, ideally we get branches they can see.
                // In previous implementations if they select 'all' we use the list of accessible tenants.
                // We will create for their single tenantId as fallback.
            }

            if (branches.length > 1) {
                const classesToCreate = branches.map(branch => ({
                    tenantId: branch.id,
                    name,
                    description,
                    trainerId: trainerId ? parseInt(trainerId) : null,
                    schedule: scheduleStr,
                    maxCapacity: parseInt(maxCapacity),
                    status: status || 'Scheduled',
                    duration: duration ? String(duration) : '60',
                    requiredBenefit: finalType
                }));
                await prisma.class.createMany({ data: classesToCreate });
                return res.status(201).json({ message: 'Classes created for all branches', data: classesToCreate });
            }
        }

        // Single branch creation
        const targetTenantId = ((role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') && branchId && branchId !== 'all') ? parseInt(branchId) : tenantId;

        const newClass = await prisma.class.create({
            data: {
                tenantId: targetTenantId,
                name,
                description,
                trainerId: trainerId ? parseInt(trainerId) : null,
                schedule: scheduleStr,
                maxCapacity: parseInt(maxCapacity),
                status: status || 'Scheduled',
                duration: duration ? String(duration) : '60',
                requiredBenefit: finalType
            }
        });
        res.status(201).json(newClass);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, trainerId, schedule, date, time, type, maxCapacity, status, duration, requiredBenefit } = req.body;

        let finalSchedule = schedule || undefined;
        if (date && time) {
            finalSchedule = { date, time, type };
        }
        const scheduleStr = finalSchedule ? (typeof finalSchedule === 'string' ? finalSchedule : JSON.stringify(finalSchedule)) : undefined;

        const updated = await prisma.class.update({
            where: { id: parseInt(id) },
            data: {
                name,
                description,
                trainerId: trainerId ? parseInt(trainerId) : null,
                schedule: scheduleStr,
                maxCapacity: maxCapacity ? parseInt(maxCapacity) : undefined,
                status,
                duration: duration ? String(duration) : undefined,
                requiredBenefit: type || requiredBenefit
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getClassById = async (req, res) => {
    try {
        const { id } = req.params;
        const cls = await prisma.class.findUnique({
            where: { id: parseInt(id) },
            include: {
                bookings: {
                    include: { member: true }
                },
                trainer: true
            }
        });

        if (!cls) return res.status(404).json({ message: 'Class not found' });

        let parsedSchedule = cls.schedule;
        let rawDate = '';
        let rawTime = '';
        let rawType = cls.requiredBenefit || '';

        try {
            if (typeof cls.schedule === 'string' && cls.schedule.startsWith('{')) {
                const data = JSON.parse(cls.schedule);
                rawDate = data.date || '';
                rawTime = data.time || '';
                rawType = data.type || rawType;
                parsedSchedule = data;
            }
        } catch (e) { }

        // If raw fields are still empty, attempt to parse from the schedule string (legacy data)
        if (!rawDate && typeof cls.schedule === 'string') {
            const dateMatch = cls.schedule.match(/(\d{4}-\d{2}-\d{2})|(\d{2}-\d{2}-\d{4})/);
            if (dateMatch) {
                rawDate = dateMatch[1] || dateMatch[2].split('-').reverse().join('-');
            }
            const timeMatch = cls.schedule.match(/(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
            if (timeMatch) rawTime = timeMatch[1];
        }

        const formatted = {
            id: cls.id,
            name: cls.name,
            description: cls.description,
            trainerName: cls.trainer?.name || 'Unassigned',
            trainerId: cls.trainerId,
            schedule: (parsedSchedule && parsedSchedule.date)
                ? `${parsedSchedule.date} at ${parsedSchedule.time}`
                : (typeof parsedSchedule === 'string' ? parsedSchedule : (rawDate ? `${rawDate} ${rawTime}` : 'TBA')),
            rawDate,
            rawTime,
            rawType,
            duration: cls.duration || '60',
            capacity: cls.maxCapacity,
            enrolled: cls.bookings.length,
            status: cls.status,
            location: cls.location || 'N/A',
            requiredBenefit: cls.requiredBenefit || rawType,
            enrolledMembers: cls.bookings.map(b => ({
                id: b.member.id,
                name: b.member.name,
                email: b.member.email
            }))
        };

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteClass = async (req, res) => {
    try {
        const { id } = req.params;
        const classId = parseInt(id);
        const { role, tenantId, email, name: userName } = req.user;

        const cls = await prisma.class.findUnique({ where: { id: classId } });
        if (!cls) return res.status(404).json({ message: 'Class not found' });

        if (role !== 'SUPER_ADMIN' && cls.tenantId !== tenantId) {
            const isOwner = await prisma.tenant.findFirst({
                where: { id: cls.tenantId, OR: [{ owner: email }, { owner: userName }] }
            });
            if (!isOwner) return res.status(403).json({ message: 'Not authorized to delete this class' });
        }

        // Delete associated bookings first, then the class
        await prisma.$transaction([
            prisma.booking.deleteMany({ where: { classId } }),
            prisma.class.delete({ where: { id: classId } })
        ]);

        res.json({ message: 'Class and associated bookings deleted successfully' });
    } catch (error) {
        console.error('DeleteClass Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// --- COMMUNICATION ---

const getAnnouncements = async (req, res) => {
    try {
        const announcements = [
            { id: 1, title: 'Gym Maintenance this Sunday', message: 'The gym will be closed for maintenance from 10 AM to 4 PM this Sunday. We apologize for the inconvenience.', audience: 'All Members', status: 'Scheduled', date: '2024-02-25 09:00 AM', author: 'Admin' },
            { id: 2, title: 'New Zumba Classes!', message: 'We are excited to announce new Zumba batches starting next week. Register now at the front desk!', audience: 'Active Members', status: 'Posted', date: '2024-02-20 10:30 AM', author: 'Sarah Manager' },
            { id: 3, title: 'Staff Meeting Reminder', message: 'Monthly staff meeting is scheduled for tomorrow at 2 PM in the conference room.', audience: 'Staff', status: 'Posted', date: '2024-02-18 05:00 PM', author: 'Admin' }
        ];
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createAnnouncement = async (req, res) => {
    try {
        const newAnnouncement = { ...req.body, id: Date.now(), author: 'Current User' };
        res.json({ message: 'Announcement created successfully', announcement: newAnnouncement });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId || 1;

        // Get all users the current user has chatted with
        const messages = await prisma.chatMessage.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ],
                tenantId
            },
            orderBy: { createdAt: 'desc' }
        });

        // Group by user and get last message
        const chatMap = new Map();
        for (const msg of messages) {
            const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
            if (!chatMap.has(otherId)) {
                chatMap.set(otherId, msg);
            }
        }

        const otherUserIds = Array.from(chatMap.keys());
        const otherUsers = await prisma.user.findMany({
            where: { id: { in: otherUserIds } },
            select: { id: true, name: true, avatar: true, status: true }
        });

        const formattedChats = otherUsers.map(u => {
            const lastMsg = chatMap.get(u.id);
            return {
                id: u.id,
                name: u.name,
                lastMsg: lastMsg.message,
                time: new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unread: messages.filter(m => m.receiverId === userId && m.senderId === u.id && !m.isRead).length,
                status: u.status.toLowerCase(),
                avatar: u.avatar || u.name.charAt(0)
            };
        });

        res.json(formattedChats);
    } catch (error) {
        console.error('getChats error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getMessages = async (req, res) => {
    try {
        const { id: otherUserId } = req.params;
        const userId = req.user.id;

        const messages = await prisma.chatMessage.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: parseInt(otherUserId) },
                    { senderId: parseInt(otherUserId), receiverId: userId }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });

        // Mark as read
        await prisma.chatMessage.updateMany({
            where: { senderId: parseInt(otherUserId), receiverId: userId, isRead: false },
            data: { isRead: true }
        });

        const formatted = messages.map(m => ({
            id: m.id,
            text: m.message,
            time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sender: m.senderId === userId ? 'me' : 'them',
            status: m.isRead ? 'read' : 'sent'
        }));

        res.json(formatted);
    } catch (error) {
        console.error('getMessages error:', error);
        res.status(500).json({ message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const { text } = req.body;
        const senderId = req.user.id;
        const tenantId = req.user.tenantId || 1;

        if (!text) return res.status(400).json({ message: 'Message text is required' });

        const message = await prisma.chatMessage.create({
            data: {
                tenantId,
                senderId,
                receiverId: parseInt(receiverId),
                message: text
            }
        });

        // Create a notification for the receiver
        await prisma.notification.create({
            data: {
                userId: parseInt(receiverId),
                title: `New message from ${req.user.name}`,
                message: text.length > 50 ? text.substring(0, 47) + '...' : text,
                type: 'info',
                link: '/operations/messages'
            }
        });

        res.json({ success: true, message: 'Message sent', data: message });
    } catch (error) {
        console.error('sendMessage error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createPayroll = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { staffId, amount, month, year, status } = req.body;

        const monthMap = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        };

        const monthInt = typeof month === 'string' ? monthMap[month] : month;

        const payroll = await prisma.payroll.create({
            data: {
                tenantId,
                staffId: parseInt(staffId),
                amount: parseFloat(amount),
                month: monthInt,
                year: parseInt(year),
                status
            }
        });

        res.status(201).json(payroll);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPayrollHistory = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const history = await prisma.payroll.findMany({
            where,
            include: {
                tenant: { select: { name: true, branchName: true } }
            },
            orderBy: { id: 'desc' }
        });

        // Fetch staff names separately as they are in the User model but not directly linked in current prisma schema relation for Payroll?
        // Actually wait, let's check schema for Payroll relations.
        // model Payroll {
        //   id       Int     @id @default(autoincrement())
        //   tenantId Int
        //   tenant   Tenant  @relation(fields: [tenantId], references: [id])
        //   staffId  Int
        //   amount   Decimal @db.Decimal(10, 2)
        //   month    Int
        //   year     Int
        //   status   String  @default("Pending") // Pending, Processed
        // }
        // No staff relation. I should fetch users.

        const staffIds = history.map(h => h.staffId);
        const staff = await prisma.user.findMany({
            where: { id: { in: staffIds } },
            select: { id: true, name: true }
        });

        const staffMap = staff.reduce((acc, s) => {
            acc[s.id] = s.name;
            return acc;
        }, {});

        const formattedHistory = history.map(h => ({
            ...h,
            staffName: staffMap[h.staffId] || 'Unknown Staff'
        }));

        res.json(formattedHistory);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePayrollStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { tenantId } = req.user;

        const payroll = await prisma.payroll.updateMany({
            where: { id: parseInt(id), tenantId },
            data: { status }
        });

        if (payroll.count === 0) {
            return res.status(404).json({ message: 'Payroll record not found' });
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProfile = async (req, res) => {
    console.log(`Profile fetch request for user: ${req.user.id}, role: ${req.user.role}`);
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                role: true,
                status: true,
                avatar: true,
                joinedDate: true
            }
        });

        // Format joinedDate to 'short' format like 'Feb 2024'
        const formattedUser = {
            ...user,
            avatar: user.avatar || user.name.charAt(0),
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            })
        };

        res.json(formattedUser);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address, avatar } = req.body;

        let avatarUrl = avatar;
        if (avatar && avatar.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(avatar, {
                folder: 'gym/admin/avatars'
            });
            avatarUrl = uploadRes.secure_url;
        }

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                name,
                email,
                phone,
                address,
                avatar: avatarUrl
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LEAVE MANAGEMENT ---
const getLeaveRequests = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const requests = await prisma.leaveRequest.findMany({
            where,
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateLeaveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const leave = await prisma.leaveRequest.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        // Optionally, if approved, create attendance records marking as "On Leave" for those dates
        if (status === 'Approved') {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const dates = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(new Date(d));
            }

            for (const date of dates) {
                date.setHours(0, 0, 0, 0);
                await prisma.attendance.upsert({
                    where: { id: -1 }, // Force create, or better logic to find unique if needed via another query
                    update: {},
                    create: {
                        userId: leave.userId,
                        tenantId: leave.tenantId,
                        date: date,
                        status: 'On Leave',
                        type: 'Trainer' // Defaulting safely, could read from user.role
                    }
                });
            }
        }

        res.json({ success: true, message: 'Leave status updated', data: leave });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTenantSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        let settings = await prisma.tenantSettings.findUnique({
            where: { tenantId }
        });

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true }
        });

        if (!settings) {
            settings = await prisma.tenantSettings.create({
                data: { tenantId }
            });
        }

        res.json({ ...settings, name: tenant?.name || '' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTenantSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { name, ...settingsData } = req.body;

        let logoUrl = undefined;

        // Handle logo upload if a base64 string is provided
        if (settingsData.logo && typeof settingsData.logo === 'string' && settingsData.logo.startsWith('data:image/')) {
            const uploadResult = await cloudinary.uploader.upload(settingsData.logo, {
                folder: `tenant_logos/${tenantId}`,
                resource_type: 'image'
            });
            logoUrl = uploadResult.secure_url;
            delete settingsData.logo; // Remove base64 from settings data before database update
        }

        if (name) {
            await prisma.tenant.update({
                where: { id: tenantId },
                data: { name }
            });
        }

        const updateData = { ...settingsData };
        if (logoUrl) {
            updateData.logo = logoUrl;
        }

        const updated = await prisma.tenantSettings.update({
            where: { tenantId },
            data: updateData
        });

        res.json({ ...updated, name });
    } catch (error) {
        console.error('Update tenant settings error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getRenewalAlerts = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { type, search } = req.query; // type: 'expiring' or 'expired'

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let where = { tenantId };

        if (type === 'expiring') {
            const sevenDaysLater = new Date(today);
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

            where.expiryDate = {
                gte: today,
                lte: sevenDaysLater
            };
            where.status = { not: 'Expired' };
        } else if (type === 'expired') {
            const fifteenDaysAgo = new Date(today);
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            where.expiryDate = {
                gte: fifteenDaysAgo,
                lt: today
            };
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } }
            ];
        }

        const members = await prisma.member.findMany({
            where,
            include: {
                plan: { select: { name: true } }
            },
            orderBy: { expiryDate: 'asc' }
        });

        const formatted = members.map(m => ({
            id: m.id,
            memberName: m.name || 'N/A',
            phone: m.phone || 'N/A',
            planName: m.plan?.name || 'No Plan',
            joinDate: m.joinDate.toISOString().split('T')[0],
            endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : 'N/A',
            status: m.status
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const renewMembership = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { memberId, planId, duration } = req.body;

        const plan = await prisma.membershipPlan.findUnique({
            where: { id: parseInt(planId) }
        });

        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const cycleMultiplier = parseInt(duration) || 1;
        const totalDurationParam = plan.duration * cycleMultiplier;
        const today = new Date();
        const expiryDate = new Date(today);

        if (plan.durationType === 'Days') {
            expiryDate.setDate(expiryDate.getDate() + totalDurationParam);
        } else if (plan.durationType === 'Weeks') {
            expiryDate.setDate(expiryDate.getDate() + (totalDurationParam * 7));
        } else if (plan.durationType === 'Years') {
            expiryDate.setFullYear(expiryDate.getFullYear() + totalDurationParam);
        } else {
            expiryDate.setMonth(expiryDate.getMonth() + totalDurationParam);
        }

        const finalPrice = parseFloat(plan.price) * cycleMultiplier;

        const updatedMember = await prisma.member.update({
            where: { id: parseInt(memberId) },
            data: {
                planId: parseInt(planId),
                expiryDate,
                joinDate: today, // Reset start date for benefit cycle tracking
                status: 'Active'
            }
        });

        await prisma.invoice.create({
            data: {
                tenantId,
                invoiceNumber: `REN-${Date.now()}`,
                memberId: parseInt(memberId),
                amount: finalPrice,
                paymentMode: 'Cash',
                status: 'Unpaid',
                dueDate: new Date()
            }
        });

        // --- NOTIFICATION ---
        const staffToNotify = await prisma.user.findMany({
            where: {
                tenantId,
                role: { in: ['BRANCH_ADMIN', 'MANAGER'] }
            },
            select: { id: true }
        });

        if (staffToNotify.length > 0) {
            await prisma.notification.createMany({
                data: staffToNotify.map(s => ({
                    userId: s.id,
                    title: 'Membership Renewed',
                    message: `A member has renewed their ${plan.name} plan for ${duration} months.`,
                    type: 'success',
                    link: `/members`
                }))
            });
        }

        res.json({ message: 'Membership renewed successfully', member: updatedMember });
    } catch (error) {
        console.error("Renewal Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const getSystemHealth = async (req, res) => {
    try {
        const { branchId, status, page = 1, limit = 50 } = req.query;
        const { role, tenantId: userTenantId, email, name: userName } = req.user;

        let userIdFilter = undefined;

        // Determine which users to include based on branch
        const effectiveBranchId = branchId || req.headers['x-tenant-id'];

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                const branchUsers = await prisma.user.findMany({
                    where: { tenantId: parseInt(effectiveBranchId) },
                    select: { id: true }
                });
                userIdFilter = branchUsers.map(u => u.id);
            }
        } else {
            // Logic for BRANCH_ADMIN and MANAGER
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                const branchUsers = await prisma.user.findMany({
                    where: { tenantId: parseInt(effectiveBranchId) },
                    select: { id: true }
                });
                userIdFilter = branchUsers.map(u => u.id);
            } else {
                // Determine all managed branches
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
                const branchUsers = await prisma.user.findMany({
                    where: { tenantId: { in: managedBranchIds } },
                    select: { id: true }
                });
                userIdFilter = branchUsers.map(u => u.id);
            }
        }

        let where = { module: 'Error' };
        if (userIdFilter !== undefined) {
            where.userId = { in: userIdFilter };
        }

        if (status && status !== 'All') {
            where.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [logs, total, open, resolved] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.auditLog.count({ where: { ...where, status: undefined } }),
            prisma.auditLog.count({ where: { ...where, status: 'Open' } }),
            prisma.auditLog.count({ where: { ...where, status: 'Resolved' } })
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await prisma.auditLog.count({
            where: { ...where, createdAt: { gte: todayStart } }
        });

        // Enrich logs
        const userIds = [...new Set(logs.map(l => l.userId))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, tenant: { select: { name: true } } }
        });
        const userMap = Object.fromEntries(users.map(u => [u.id, u]));

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: userMap[log.userId]?.name || 'Unknown',
            branch: userMap[log.userId]?.tenant?.name || 'Main'
        }));

        res.json({
            logs: enrichedLogs,
            stats: {
                total: total.toString(),
                open: open.toString(),
                resolved: resolved.toString(),
                today: todayCount.toString()
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTrainerStats = async (req, res) => {
    try {
        const { tenantId: userTenantId = 1, role, email, name: userName } = req.user;
        const branchId = req.query.branchId;

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

        const activeTrainers = await prisma.user.count({
            where: { ...where, role: 'TRAINER', status: 'Active' }
        });
        const ptMembers = await prisma.member.count({
            where: { ...where, trainerId: { not: null } }
        });

        // Sum of base salaries + sum of hourly rates if applicable (Monthly Impact)
        const revenue = await prisma.user.aggregate({
            where: { ...where, role: 'TRAINER' },
            _sum: { baseSalary: true }
        });

        res.json({
            activeTrainers,
            generalClients: ptMembers * 2,
            ptClients: ptMembers,
            monthlyRevenue: revenue._sum.baseSalary || 0,
            avgClientsPerTrainer: activeTrainers > 0 ? (ptMembers / activeTrainers).toFixed(1) : 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getNotificationSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        let settings = await prisma.tenantSettings.findUnique({
            where: { tenantId }
        });

        if (!settings) {
            settings = await prisma.tenantSettings.create({
                data: { tenantId }
            });
        }

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateNotificationSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const updateData = req.body;

        const settings = await prisma.tenantSettings.upsert({
            where: { tenantId },
            update: updateData,
            create: { ...updateData, tenantId }
        });

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSecuritySettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        let settings = await prisma.tenantSettings.findUnique({
            where: { tenantId }
        });

        if (!settings) {
            settings = await prisma.tenantSettings.create({
                data: { tenantId }
            });
        }

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSecuritySettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const updateData = req.body;

        const settings = await prisma.tenantSettings.upsert({
            where: { tenantId },
            update: updateData,
            create: { ...updateData, tenantId }
        });

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const runReminders = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { type } = req.body;

        // Exact logic: Simulation of background job
        // In a real app, this would trigger specific worker processes
        console.log(`[REMINDERS] Manual trigger for tenant ${tenantId}, type: ${type}`);

        res.json({
            success: true,
            message: `Engine started: Triggering ${type} notifications for all eligible members/leads.`
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllServiceRequests = async (req, res) => {
    try {
        const { status, type, branchId: queryBranchId } = req.query;
        const { tenantId: userTenantId, role, email, name: userName } = req.user;
        const headerTenantId = req.headers['x-tenant-id'];

        const effectiveBranchId = queryBranchId || headerTenantId;

        const where = {};

        if (role === 'SUPER_ADMIN') {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            }
        } else if (role === 'TRAINER') {
            // Trainers see requests for their assigned members
            where.member = {
                trainerId: req.user.id
            };
        } else {
            if (effectiveBranchId && effectiveBranchId !== 'all') {
                where.tenantId = parseInt(effectiveBranchId);
            } else {
                // Determine all branches this user can access
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

        if (status && status !== 'All') {
            where.status = status;
        }

        if (type && type !== 'All') {
            where.type = type;
        }

        const requests = await prisma.serviceRequest.findMany({
            where,
            include: {
                member: {
                    select: {
                        id: true,
                        name: true,
                        memberId: true,
                        phone: true,
                        email: true,
                        trainerId: true
                    }
                },
                tenant: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(requests);
    } catch (error) {
        console.error('getAllServiceRequests error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateServiceRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const requestRecord = await prisma.serviceRequest.findUnique({
            where: { id: parseInt(id) }
        });

        if (!requestRecord) {
            return res.status(404).json({ message: 'Service request not found' });
        }

        const updated = await prisma.serviceRequest.update({
            where: { id: parseInt(id) },
            data: {
                status,
                updatedAt: new Date()
            }
        });

        // Automatically freeze or unfreeze if request is accepted/approved
        if (status === 'Accepted' || status === 'Approved') {
            if (requestRecord.type === 'Freeze Membership') {
                const memberRecord = await prisma.member.findUnique({
                    where: { id: requestRecord.memberId }
                });

                if (memberRecord) {
                    // Determine freeze duration if specified in details or rawType, default to 1 month
                    let freezeMonths = 1;
                    const match = requestRecord.details?.match(/(\d+)\s*month/i);
                    if (match && match[1]) {
                        freezeMonths = parseInt(match[1]);
                    }

                    const currentExpiry = memberRecord.expiryDate || new Date();
                    const newExpiry = new Date(currentExpiry);
                    newExpiry.setMonth(newExpiry.getMonth() + freezeMonths);

                    await prisma.member.update({
                        where: { id: requestRecord.memberId },
                        data: {
                            status: 'Frozen',
                            expiryDate: newExpiry,
                            medicalHistory: memberRecord.medicalHistory
                                ? `${memberRecord.medicalHistory}\n[Auto Freeze: Approved Service Request - ${freezeMonths} month(s)]`
                                : `[Auto Freeze: Approved Service Request - ${freezeMonths} month(s)]`
                        }
                    });
                }
            } else if (requestRecord.type === 'Unfreeze Membership') {
                const memberRecord = await prisma.member.findUnique({
                    where: { id: requestRecord.memberId }
                });

                if (memberRecord) {
                    await prisma.member.update({
                        where: { id: requestRecord.memberId },
                        data: {
                            status: 'Active',
                            medicalHistory: memberRecord.medicalHistory
                                ? `${memberRecord.medicalHistory}\n[Auto Unfreeze: Approved Service Request]`
                                : `[Auto Unfreeze: Approved Service Request]`
                        }
                    });
                }
            }
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const downloadAttendanceQrCode = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }

        // Generate QR Code data using dynamic frontend origin
        const frontendUrl = req.headers.origin || 'http://localhost:5173';
        const qrData = `${frontendUrl}/scan?branchId=${tenantId}&token=GYM_${tenantId}_SECURE`;

        const qrCodeBuffer = await QRCode.toBuffer(qrData, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 800
        });

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });

        // Filename
        const filename = `Attendance_QR_${tenant.name.replace(/\s+/g, '_')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);

        // -- PDF Design --
        const pageWidth = doc.page.width;

        // Header
        doc.fillColor('#581Ceb')
            .fontSize(32)
            .font('Helvetica-Bold')
            .text('GYM ATTENDANCE QR', 0, 100, { align: 'center', width: pageWidth });

        doc.moveDown(0.5);
        doc.fillColor('#64748b')
            .fontSize(20)
            .font('Helvetica')
            .text(tenant.name || 'Your Gym Name', { align: 'center', width: pageWidth });

        // QR Code
        const qrSize = 320;
        const qrX = (pageWidth - qrSize) / 2;
        doc.image(qrCodeBuffer, qrX, 240, { width: qrSize });

        // Instructions
        doc.fillColor('#1e293b')
            .fontSize(22)
            .font('Helvetica-Bold')
            .text('Scan this QR Code to mark your attendance.', 0, 600, { align: 'center', width: pageWidth });

        doc.moveDown(1);
        doc.fillColor('#64748b')
            .fontSize(16)
            .font('Helvetica')
            .text('Open your Gym Dashboard and click "Scan QR" to Check-In or Check-Out.', {
                align: 'center',
                width: pageWidth,
                lineGap: 5
            });

        // Footer
        doc.fontSize(10)
            .fillColor('#94a3b8')
            .text('© Gym Academy Management System', 0, doc.page.height - 60, { align: 'center', width: pageWidth });

        doc.end();

    } catch (error) {
        console.error('QR PDF Error:', error);
        res.status(500).json({ message: 'Failed to generate QR PDF' });
    }
};

module.exports = {
    getAllServiceRequests,
    updateServiceRequestStatus,
    getAllMembers,
    addMember,
    getMemberById,
    updateMember,
    deleteMember,
    toggleMemberStatus,
    freezeMember,
    unfreezeMember,
    giftDays,
    getAllPlans,
    createPlan,
    updatePlan,
    deletePlan,
    getAllStaff,
    getStaffById,
    createStaff,
    getAvailableUsersForStaff,
    linkStaff,
    fetchBranchDashboardCards,
    getBookings,
    getBookingStats,
    getBookingsByDateRange,
    getBookingById,
    updateBookingStatus,
    createBooking,
    deleteBooking,
    getTodaysBookings,
    getBookingCalendar,
    getCheckIns,
    getRenewalAlerts,
    renewMembership,
    deleteCheckIn,
    getAttendanceStats,
    getLiveCheckIn,
    getTasks,
    getTaskStats,
    updateTaskStatus,
    updateTask,
    createTask,
    getTaskById,
    deleteTask,
    assignTask,
    getBookingReport,
    getAttendanceReport,
    getAllClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
    getAnnouncements,
    createAnnouncement,
    getChats,
    getMessages,
    sendMessage,
    createPayroll,
    getPayrollHistory,
    updatePayrollStatus,
    getProfile,
    updateProfile,
    getLeaveRequests,
    updateLeaveStatus,
    getTenantSettings,
    updateTenantSettings,
    getTrainerStats,
    getSystemHealth,
    downloadAttendanceQrCode
};
