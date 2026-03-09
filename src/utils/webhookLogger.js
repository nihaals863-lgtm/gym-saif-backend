const prisma = require('../config/prisma');

const logWebhook = async (event, method, endpoint, statusCode, payload) => {
    try {
        await prisma.webhookLog.create({
            data: {
                event,
                method,
                endpoint,
                statusCode,
                status: statusCode >= 200 && statusCode < 300 ? 'success' : 'failed',
                payload: payload ? JSON.stringify(payload) : null
            }
        });
    } catch (error) {
        console.error('Failed to log webhook event:', error);
    }
};

module.exports = { logWebhook };
