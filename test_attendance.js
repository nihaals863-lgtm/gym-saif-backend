const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const AIOT_BASE_URL = 'http://212.38.94.228:9000';
const AIOT_USERNAME = process.env.AIOT_USERNAME;
const AIOT_PASSWORD = process.env.AIOT_PASSWORD;
const TENANT_ID = process.env.AIOT_TENANT_ID || '1';

async function testAttendanceSummary() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${AIOT_BASE_URL}/login`, {
            username: AIOT_USERNAME,
            password: AIOT_PASSWORD,
            code: "",
            uuid: ""
        }, {
            headers: { 'tenant-id': TENANT_ID }
        });

        const token = loginRes.data.token;
        
        console.log('Testing /attend/attnRecord/attnStaSumDtolist...');
        const attRes = await axios.get(`${AIOT_BASE_URL}/attend/attnRecord/attnStaSumDtolist?pageNum=1&pageSize=10`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'tenant-id': TENANT_ID
            }
        });
        
        console.log('Attendance Summary Response:', JSON.stringify(attRes.data, null, 2));

    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}

testAttendanceSummary();
