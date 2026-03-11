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

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: true, // MUST be true for SameSite='none'
            sameSite: 'none', // Allows cross-origin cookies
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName
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
                const benefits = member.plan?.benefits || [];
                // Initialize with full limits from plan
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

                // Subtract used credits based on bookings
                member.bookings.forEach(b => {
                    const className = (b.class?.name || '').toLowerCase();
                    if (className.includes('sauna')) {
                        benefitWallet.saunaSessions = Math.max(0, benefitWallet.saunaSessions - 1);
                    } else if (className.includes('ice bath')) {
                        benefitWallet.iceBathCredits = Math.max(0, benefitWallet.iceBathCredits - 1);
                    } else {
                        benefitWallet.classCredits = Math.max(0, benefitWallet.classCredits - 1);
                    }
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
            avatar: user.avatar || user.name.charAt(0),
            status: user.status || 'Active',
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName,
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            }),
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
            finalData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: finalData
        });

        if (user.role === 'MEMBER') {
            await prisma.member.updateMany({
                where: { userId: user.id },
                data: {
                    name: finalData.name,
                    phone: finalData.phone
                }
            });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar
        });
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

        if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
            return res.status(401).json({ message: 'Invalid current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { login, logout, getMe, updateProfile, changePassword };
