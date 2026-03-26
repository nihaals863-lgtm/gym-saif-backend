const axios = require('axios');

const BASE_URL = 'http://212.38.94.228:9000';

const endpoints = [
    '/getAllAcCheckRecordCount',
    '/getInfo',
    '/through/device/getDeviceTypeConfig',
    '/system/user/deptTree',
    '/attend/attnRecord/attnStaSumDtolist?pageNum=1&pageSize=10'
];

async function testConnection() {
    for (const endpoint of endpoints) {
        try {
            console.log(`Testing ${endpoint}...`);
            const response = await axios.get(`${BASE_URL}${endpoint}`);
            console.log(`- Status: ${response.status}`);
            console.log(`- Data keys: ${Object.keys(response.data).join(', ')}`);
        } catch (error) {
            console.error(`- Error testing ${endpoint}: ${error.message}`);
        }
        console.log('---');
    }
}

testConnection();
