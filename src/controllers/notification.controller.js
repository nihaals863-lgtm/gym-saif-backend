const prisma = require('../config/prisma');

const getNotifications = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Also fetch unread chat messages for count
        const unreadChatCount = await prisma.chatMessage.count({
            where: { receiverId: userId, isRead: false }
        });

        res.json({
            notifications,
            unreadChatCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.notification.update({
            where: { id: parseInt(id) },
            data: { read: true }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        const { id: userId } = req.user;
        await prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.notification.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
};
