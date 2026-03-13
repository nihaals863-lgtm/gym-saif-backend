// gym_backend/src/server.js
const app = require('./app');

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
    console.log(`Server successfully started and listening on port ${PORT}`);
    console.log(`PID: ${process.pid}`);

    // Automatic Birthday Check - Runs every 24 hours
    const { checkBirthdays } = require('./controllers/communication.controller');
    
    // Initial check on start
    checkBirthdays().catch(err => console.error('Initial birthday check failed:', err));

    setInterval(() => {
        console.log('[AUTOMATION] Running daily birthday check...');
        checkBirthdays().catch(err => console.error('Scheduled birthday check failed:', err));
    }, 24 * 60 * 60 * 1000); // 24 hours
});

server.on('error', (err) => {
    console.error('SERVER ERROR:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
