// gym_backend/scripts/create-db.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function createDb() {
    // Connection without database name to create the DB
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: ''
    });

    await connection.query('CREATE DATABASE IF NOT EXISTS root;');
    console.log('Database "root" created or already exists.');
    await connection.end();
}

createDb().catch(console.error);
