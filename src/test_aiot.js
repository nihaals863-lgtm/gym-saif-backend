const axios = require('axios');

const AIOT_BASE_URL = 'http://212.38.94.228:9000';
const AIOT_USERNAME = 'admin';
const AIOT_PASSWORD = 'admin123';
const AIOT_TENANT_ID = '1';

async function test() {
    try {
        const loginRes = await axios.post(`${AIOT_BASE_URL}/login`, {
            username: AIOT_USERNAME,
            password: AIOT_PASSWORD,
            code: "",
            uuid: ""
        }, {
            headers: { 'tenant-id': AIOT_TENANT_ID }
        });

        const token = loginRes.data.token;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'tenant-id': AIOT_TENANT_ID
        };

        console.log('--- VERIFYING CONTROLLER LOGIC ---');

        const [deviceListRes, recordsRes, configRes] = await Promise.all([
            axios.get(`${AIOT_BASE_URL}/through/device/getDeviceList`, { headers }),
            axios.get(`${AIOT_BASE_URL}/getAllAcCheckRecordCount`, { headers }),
            axios.get(`${AIOT_BASE_URL}/through/device/getDeviceTypeConfig`, { headers })
        ]);

        const deviceList = deviceListRes.data.rows || [];
        const recordData = recordsRes.data.data;
        const connectionType = configRes.data.data;

        console.log('Online Devices (onlineFlag=1):', deviceList.filter(d => d.onlineFlag === 1).length);
        console.log('Offline Devices (onlineFlag=0):', deviceList.filter(d => d.onlineFlag === 0).length);

        // Mirroring getDeviceList logic
        const devices = deviceList.map(device => {
            const lastRecord = recordData?.acCheckRecordList?.find(r => r.deviceKey === device.deviceKey);
            return {
                deviceName: device.deviceName,
                deviceKey: device.deviceKey,
                status: device.onlineFlag === 1 ? 'online' : 'offline',
                connectionType: connectionType?.toUpperCase() || 'WAN',
                todayEntries: lastRecord ? (recordData.acCheckRecordMap?.totalCount || 0) : 0,
                lastSeen: device.lastActiveTime || lastRecord?.createTime,
                lastPersonName: lastRecord?.personName || 'No recent activity'
            };
        });

        console.log('\nFinal Devices List for Frontend:');
        console.log(JSON.stringify(devices, null, 2));

        // Mirroring getDashboardSummary logic
        const onlineCount = deviceList.filter(d => d.onlineFlag === 1).length;
        const offlineCount = deviceList.length - onlineCount;

        const summary = {
            onlineCount,
            offlineCount,
            totalCountToday: recordData?.acCheckRecordMap?.totalCount || 0,
            records: (recordData?.acCheckRecordList || []).slice(0, 5).map(r => r.personName)
        };

        console.log('\nDashboard Summary:');
        console.log(JSON.stringify(summary, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
