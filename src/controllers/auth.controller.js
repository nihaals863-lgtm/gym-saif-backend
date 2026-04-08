// gym_backend/src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true }
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check for suspended tenant
        if (user.role !== 'SUPER_ADMIN' && user.tenant?.status === 'Suspended') {
            const settings = await prisma.saaSSettings.findFirst();
            const supportNum = settings?.supportNumber || 'our support team';
            return res.status(403).json({ 
                message: `This gym is currently suspended. Please contact support at ${supportNum}.`,
                supportNumber: supportNum 
            });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Audit Log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'Login',
                module: 'Auth',
                details: `User ${user.email} logged in successfully`,
                ip: req.ip || req.headers['x-forwarded-for'] || '0.0.0.0',
                status: 'Success'
            }
        });

        const tenantSettings = user.tenantId
            ? await prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } })
            : null;

        // Fetch member avatar if needed
        let avatar = user.avatar;
        if (!avatar && user.role === 'MEMBER') {
            const member = await prisma.member.findUnique({ where: { userId: user.id } });
            avatar = member?.avatar;
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: avatar,
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName,
            tenantName: user.tenant?.name,
            logo: tenantSettings?.logo || null,
            token
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logout = (req, res) => {
    res.cookie('token', '', { httpOnly: true, expires: new Date(0) });
    res.json({ message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
    try {
        const user = req.user;
        let memberData = {};
        let memberAvatar = null;

        const tenantSettings = user.tenantId
            ? await prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } })
            : null;

        if (user.role === 'MEMBER') {
            const member = await prisma.member.findUnique({
                where: { userId: user.id },
                include: {
                    plan: true,
                    bookings: {
                        where: { status: { in: ['Upcoming', 'Completed'] } },
                        include: { class: true }
                    }
                }
            });

            if (member) {
                memberAvatar = member.avatar;
                const benefits = member.plan?.benefits || [];
                const benefitWallet = {
                    classCredits: 10,
                    saunaSessions: 0,
                    iceBathCredits: 0
                };

                if (Array.isArray(benefits)) {
                    benefits.forEach(b => {
                        const name = (b.name || '').toLowerCase();
                        if (name.includes('sauna')) benefitWallet.saunaSessions = b.limit || 0;
                        if (name.includes('ice bath')) benefitWallet.iceBathCredits = b.limit || 0;
                        if (name.includes('pt') || name.includes('class')) benefitWallet.classCredits = b.limit || 10;
                    });
                }

                member.bookings.forEach(b => {
                    const className = (b.class?.name || '').toLowerCase();
                    if (className.includes('sauna')) benefitWallet.saunaSessions = Math.max(0, benefitWallet.saunaSessions - 1);
                    else if (className.includes('ice bath')) benefitWallet.iceBathCredits = Math.max(0, benefitWallet.iceBathCredits - 1);
                    else benefitWallet.classCredits = Math.max(0, benefitWallet.classCredits - 1);
                });

                benefitWallet.ptSessions = benefitWallet.classCredits;

                memberData = {
                    memberId: member.memberId,
                    status: member.status,
                    plan: member.plan?.name || 'No Active Plan',
                    planValidity: member.plan ? `${member.plan.duration} ${member.plan.durationType}` : 'N/A',
                    membershipStartDate: member.joinDate,
                    membershipExpiryDate: member.expiryDate || member.joinDate,
                    membershipStatus: member.status,
                    benefitWallet
                };
            }
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone || '',
            address: user.address || '',
            avatar: user.avatar || memberAvatar || user.name.charAt(0),
            status: user.status || 'Active',
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName,
            tenantName: user.tenant?.name,
            logo: tenantSettings?.logo || null,
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            }),
            token: req.cookies.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : undefined),
            ...memberData
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { password, ...updateData } = req.body;

        let finalData = { ...updateData };
        if (password) {
            const salt = await bcrypt.genSalt(10);
            finalData.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: finalData
        });

        // If user is a member, sync phone and avatar to member table too
        if (updatedUser.role === 'MEMBER') {
            const memberRecord = await prisma.member.findUnique({ where: { userId: updatedUser.id } });
            if (memberRecord) {
                await prisma.member.update({
                    where: { id: memberRecord.id },
                    data: {
                        phone: updatedUser.phone,
                        avatar: updatedUser.avatar,
                        name: updatedUser.name
                    }
                });
            }
        }

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    login,
    logout,
    getMe,
    updateProfile
};
