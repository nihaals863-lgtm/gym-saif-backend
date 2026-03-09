const express = require('express');
const {
    getCommStats,
    getAnnouncements,
    createAnnouncement,
    getTemplates,
    createTemplate,
    deleteTemplate,
    sendBroadcast,
    getCommLogs,
    getChatContacts,
    getChatMessages,
    sendChatMessage
} = require('../controllers/communication.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER', 'MEMBER'));

router.get('/stats', getCommStats);
router.get('/announcements', getAnnouncements);
router.post('/announcements', createAnnouncement);
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.delete('/templates/:id', deleteTemplate);
router.post('/broadcast', sendBroadcast);
router.get('/logs', getCommLogs);
router.get('/contacts', getChatContacts);
router.get('/messages/:contactId', getChatMessages);
router.post('/messages', sendChatMessage);

module.exports = router;
