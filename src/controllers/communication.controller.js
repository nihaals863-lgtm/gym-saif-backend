const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET Stats for Communication Hub
const getCommStats = async (req, res) => {
    try {
        const { branchId } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        const [totalAnnouncements, activeAnnouncements, totalLogs, totalTemplates] = await Promise.all([
            prisma.announcement.count({ where: { tenantId } }),
            prisma.announcement.count({ where: { tenantId, status: 'Active' } }),
            prisma.communicationLog.count({ where: { tenantId } }),
            prisma.messageTemplate.count({ where: { tenantId } })
        ]);

        res.json({
            totalAnnouncements,
            activeAnnouncements,
            messagesSent: totalLogs,
            templates: totalTemplates
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Announcements
const getAnnouncements = async (req, res) => {
    try {
        const { branchId, search, portal } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);
        const { role } = req.user;

        let where = { tenantId };

        // If accessed from Member Portal or user is a Member, apply privacy filters
        if (portal === 'member' || role === 'MEMBER') {
            where.status = 'Active';
            where.targetRole = { in: ['all', 'member', 'MEMBER'] };
        } else if (role === 'TRAINER') {
            where.status = 'Active';
            where.targetRole = { in: ['all', 'TRAINER'] };
        }
        // ADMIN roles see everything for management

        if (search) {
            where.AND = [
                {
                    OR: [
                        { title: { contains: search } },
                        { content: { contains: search } }
                    ]
                }
            ];
        }

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CREATE Announcement
const createAnnouncement = async (req, res) => {
    try {
        const { title, content, targetRole, priority, status } = req.body;
        const tenantId = req.user.tenantId || 1;
        const authorId = req.user.id;

        const announcement = await prisma.announcement.create({
            data: {
                tenantId,
                authorId,
                title,
                content,
                targetRole: targetRole || 'all',
                priority: parseInt(priority) || 0,
                status: status || 'Active'
            }
        });

        res.status(201).json(announcement);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Templates
const getTemplates = async (req, res) => {
    try {
        const { branchId, channel } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        let where = { tenantId };
        if (channel) where.channel = channel;

        const templates = await prisma.messageTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(templates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// SEND Broadcast
const sendBroadcast = async (req, res) => {
    try {
        const { channel, message, audience, templateId, memberId } = req.body;
        const tenantId = req.user.tenantId || 1;
        const senderId = req.user.id;

        // In a real app, this would integrate with WhatsApp/SMS/Email providers
        const log = await prisma.communicationLog.create({
            data: {
                tenantId,
                senderId,
                memberId: memberId ? parseInt(memberId) : null,
                channel: channel || 'WhatsApp',
                message,
                status: 'Sent'
            }
        });

        res.json({ message: `Message sent via ${channel}`, log });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Communication Logs
const getCommLogs = async (req, res) => {
    try {
        const { branchId, memberId } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        const logs = await prisma.communicationLog.findMany({
            where: {
                tenantId,
                ...(memberId ? { memberId: parseInt(memberId) } : {})
            },
            include: {
                // You might want to include the sender user name later
            },
            orderBy: { createdAt: 'asc' }, // Ascending for chat flow
            take: 100
        });

        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CREATE Template
const createTemplate = async (req, res) => {
    try {
        const { title, tag, body, channel } = req.body;
        const tenantId = req.user.tenantId || 1;

        const template = await prisma.messageTemplate.create({
            data: {
                tenantId,
                name: title,
                category: tag || 'General',
                content: body,
                channel: channel || 'WhatsApp'
            }
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ message: error.message });
    }
};

// DELETE Template
const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.messageTemplate.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Chat Contacts (Exact Logic: Members + Staff + Trainers based on Role)
const getChatContacts = async (req, res) => {
    try {
        const { branchId, search } = req.query;
        const { tenantId: userTenantId, role: userRole, id: currentUserId } = req.user;

        // Determine target tenantId
        let tenantId = userTenantId;
        const normalizedRole = userRole?.toUpperCase().trim();

        if (normalizedRole === 'SUPER_ADMIN' && branchId && branchId !== 'all') {
            tenantId = parseInt(branchId);
        }

        if (!tenantId && normalizedRole !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: "Tenant ID required" });
        }

        // Define query filters based on exact logic
        let userFilters = {
            tenantId,
            status: 'Active',
            id: { not: currentUserId }
        };

        let memberFilters = {
            tenantId,
            status: 'Active'
        };

        // Apply Role-Based Visibility Rules
        if (normalizedRole === 'SUPER_ADMIN') {
            // Can chat with all Branch Admins and Managers across all branches
            // If branchId is 'all', they see everyone with these roles
            userFilters.role = { in: ['BRANCH_ADMIN', 'MANAGER'] };
            if (!tenantId || branchId === 'all') {
                delete userFilters.tenantId;
                delete memberFilters.tenantId; // SuperAdmins see all active members too
            }
        } else if (normalizedRole === 'BRANCH_ADMIN' || normalizedRole === 'MANAGER') {
            // Can chat with SuperAdmin (even if different tenantId in schema, though usually they share)
            // Can chat with all Staff, Trainer and Members in their branch
            userFilters.OR = [
                { role: 'SUPER_ADMIN' },
                { tenantId, role: { in: ['STAFF', 'TRAINER', 'MANAGER', 'BRANCH_ADMIN'] } }
            ];
            delete userFilters.tenantId; // Using OR now
        } else if (normalizedRole === 'STAFF') {
            // Can chat with Branch Admin, Manager, and other Staff
            // Can chat with members in their branch
            userFilters.role = { in: ['BRANCH_ADMIN', 'MANAGER', 'STAFF'] };
        } else if (normalizedRole === 'TRAINER') {
            // Can chat with Branch Admin, Manager
            // Can chat with members assigned to them
            userFilters.role = { in: ['BRANCH_ADMIN', 'MANAGER'] };
            memberFilters.trainerId = currentUserId;
        } else if (normalizedRole === 'MEMBER') {
            // Can chat with Branch Admin, Manager
            // Can chat with their assigned trainer
            const memberRecord = await prisma.member.findUnique({
                where: { userId: currentUserId },
                select: { trainerId: true, tenantId: true }
            });

            userFilters.OR = [
                { role: { in: ['BRANCH_ADMIN', 'MANAGER'] }, tenantId: memberRecord?.tenantId },
                ...(memberRecord?.trainerId ? [{ id: memberRecord.trainerId }] : [])
            ];
            memberFilters = null;
        }

        // Apply search if provided
        if (search) {
            const searchObj = {
                OR: [
                    { name: { contains: search } },
                    { phone: { contains: search } }
                ]
            };
            userFilters = { ...userFilters, ...searchObj };
            if (memberFilters) memberFilters = { ...memberFilters, ...searchObj };
        }

        // Fetch Data
        const [members, users] = await Promise.all([
            memberFilters ? prisma.member.findMany({
                where: memberFilters,
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    avatar: true,
                    memberId: true,
                    userId: true
                },
                take: 100
            }) : Promise.resolve([]),
            prisma.user.findMany({
                where: userFilters,
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    avatar: true,
                    role: true
                },
                take: 100
            })
        ]);

        // Deduplication and Formatting Logic
        const contactMap = new Map();

        // 1. Process Users (Staff/Admins)
        users.forEach(u => {
            contactMap.set(u.id, {
                id: u.id,
                name: u.name,
                phone: u.phone,
                status: u.status,
                avatar: u.avatar,
                type: u.role,
                isStaff: true
            });
        });

        // 2. Process Members
        members.forEach(m => {
            // If the member is also a user, we might have already added them
            // But usually we chat with them as a "Member" entity if they are in the list
            if (!contactMap.has(m.userId || `member-${m.id}`)) {
                contactMap.set(m.userId || `member-${m.id}`, {
                    id: m.id,
                    name: m.name,
                    phone: m.phone,
                    status: m.status,
                    avatar: m.avatar,
                    type: 'MEMBER',
                    memberId: m.memberId,
                    isStaff: false
                });
            }
        });

        const finalContacts = Array.from(contactMap.values());
        res.json(finalContacts);
    } catch (error) {
        console.error('getChatContacts error:', error);
        res.status(500).json({ message: error.message });
    }
};

const sendChatMessage = async (req, res) => {
    try {
        const { receiverId, message, receiverType } = req.body;
        const tenantId = req.user.tenantId || 1;
        const senderId = req.user.id;

        // If receiverId is provided as a Member ID (common in trainer UI), we need to find their userId
        let actualReceiverUserId = parseInt(receiverId);

        if (receiverType === 'MEMBER') {
            const member = await prisma.member.findUnique({
                where: { id: parseInt(receiverId) },
                select: { userId: true }
            });
            if (member?.userId) {
                actualReceiverUserId = member.userId;
            }
        }

        const chatMessage = await prisma.chatMessage.create({
            data: {
                tenantId,
                senderId,
                receiverId: actualReceiverUserId,
                message
            }
        });

        res.status(201).json(chatMessage);
    } catch (error) {
        console.error('sendChatMessage error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getChatMessages = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { isMemberId } = req.query; // If true, contactId is member.id
        const currentUserId = req.user.id;

        let targetUserId = parseInt(contactId);

        if (isMemberId === 'true') {
            const member = await prisma.member.findUnique({
                where: { id: parseInt(contactId) },
                select: { userId: true }
            });
            if (member?.userId) {
                targetUserId = member.userId;
            }
        }

        const messages = await prisma.chatMessage.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: targetUserId },
                    { senderId: targetUserId, receiverId: currentUserId }
                ]
            },
            orderBy: { createdAt: 'asc' },
            take: 100
        });

        res.json(messages);
    } catch (error) {
        console.error('getChatMessages error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getCommStats,
    getAnnouncements,
    createAnnouncement,
    getTemplates,
    createTemplate,
    deleteTemplate,
    sendBroadcast,
    getCommLogs,
    getChatContacts,
    sendChatMessage,
    getChatMessages
};
