const axios = require('axios');
const EXTERNAL_BASE_URL = 'http://212.38.94.228:9000';

const testApi = async () => {
    try {
        console.log(`Testing connection to ${EXTERNAL_BASE_URL}/getAllAcCheckRecordCount...`);
        const response = await axios.get(`${EXTERNAL_BASE_URL}/getAllAcCheckRecordCount`);
        console.log('Response status:', response.status);
        if (response.data) {
            console.log('Response data keys:', Object.keys(response.data));
            if (response.data.data) {
                console.log('Data field keys:', Object.keys(response.data.data));
                console.log('onlineMap:', response.data.data.onlineMap);
                console.log('acCheckRecordMap:', response.data.data.acCheckRecordMap);
                console.log('acCheckRecordList length:', response.data.data.acCheckRecordList ? response.data.data.acCheckRecordList.length : 0);
            } else {
                console.log('No data field in response.data');
                console.log('Full response.data:', JSON.stringify(response.data, null, 2).slice(0, 500));
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
};

testApi();
