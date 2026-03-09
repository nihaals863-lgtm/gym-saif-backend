const axios = require('axios');
const fs = require('fs');

async function testApi() {
    try {
        const baseUrl = 'http://localhost:8000/api/v1';

        // We need a log file to see the results
        const log = (msg) => {
            console.log(msg);
            fs.appendFileSync('api_test.log', msg + '\n');
        };

        fs.writeFileSync('api_test.log', 'Starting API test...\n');

        // First, let's try a public route to see if server is responding
        try {
            const root = await axios.get('http://localhost:8000/');
            log('Root responding: ' + JSON.stringify(root.data));
        } catch (e) {
            log('Root failed: ' + e.message);
        }

        // Now let's try a PT route - it will fail with 401 but that's fine, it proves the route is there
        try {
            const pt = await axios.get(baseUrl + '/pt/stats');
            log('PT Stats responding: ' + JSON.stringify(pt.data));
        } catch (e) {
            log('PT Stats failed as expected: ' + e.message + (e.response ? ' Status: ' + e.response.status : ''));
            if (e.response && e.response.status === 500) {
                log('SERVER ERROR 500: ' + JSON.stringify(e.response.data));
            }
        }

    } catch (error) {
        console.error(error);
    }
}

testApi();
