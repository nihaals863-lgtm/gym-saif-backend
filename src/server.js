// gym_backend/src/server.js
const app = require('./app');
// Trigger restart - port 8000 cleared

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
    console.log(`Server successfully started and listening on port ${PORT}`);
    console.log(`PID: ${process.pid}`);
});

server.on('error', (err) => {
    console.error('SERVER ERROR:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
