const aiotApi = require('../utils/aiotApi');

const transformImagePath = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const baseUrl = process.env.AIOT_BASE_URL?.replace('/MIPS', '') || 'http://212.38.94.228:9000';
    return `${baseUrl}${path}`;
};

const getDashboardSummary = async (req, res) => {
    try {
        const [recordsRes, deviceListRes] = await Promise.all([
            aiotApi.get('/getAllAcCheckRecordCount'),
            aiotApi.get('/through/device/getDeviceList')
        ]);
        
        const { data } = recordsRes;
        const deviceList = deviceListRes.rows || [];

        if (!data) {
            return res.status(500).json({ message: 'No data received from AIoT system' });
        }

        // Calculate counts from master device list for accuracy
        const onlineCount = deviceList.filter(d => d.onlineFlag === 1).length;
        const offlineCount = deviceList.length - onlineCount;

        const result = {
            onlineCount: onlineCount,
            offlineCount: offlineCount,
            totalCountToday: data.acCheckRecordMap?.totalCount || 0,
            totalCountAll: data.acCheckRecordMap?.totalCountTal || 0,
            employeeCountToday: data.acCheckRecordMap?.employeeCount || 0,
            employeeCountAll: data.acCheckRecordMap?.employeeCountTal || 0,
            visitorCountToday: data.acCheckRecordMap?.visitorCount || 0,
            visitorCountAll: data.acCheckRecordMap?.visitorCountTal || 0,
            alcoholCountToday: data.acCheckRecordMap?.alcoholCount || 0,
            alcoholCountAll: data.acCheckRecordMap?.alcoholCountTal || 0,
            records: (data.acCheckRecordList || []).slice(0, 10).map(record => ({
                id: record.id,
                personName: record.personName,
                personSn: record.personSn,
                deviceName: record.deviceName,
                deviceKey: record.deviceKey,
                createTime: record.createTime,
                passType: record.passType,
                imageUrl: transformImagePath(record.checkImgUri)
            }))
        };

        res.json(result);
    } catch (error) {
        console.error('Error fetching dashboard summary:', error.message);
        res.status(500).json({ message: 'Failed to fetch AIoT dashboard data', error: error.message });
    }
};

const getDeviceList = async (req, res) => {
    try {
        const [deviceListRes, recordsRes, configRes] = await Promise.all([
            aiotApi.get('/through/device/getDeviceList'),
            aiotApi.get('/getAllAcCheckRecordCount'),
            aiotApi.get('/through/device/getDeviceTypeConfig')
        ]);

        const deviceList = deviceListRes.rows || [];
        const { data: recordData } = recordsRes;
        const connectionType = configRes.data; // e.g., "wan"

        const devices = deviceList.map(device => {
            // Try to find the last record for this device to get extra info if available
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

        res.json(devices);
    } catch (error) {
        console.error('Error fetching device list:', error.message);
        res.status(500).json({ message: 'Failed to fetch device data', error: error.message });
    }
};

const getAccessRecords = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        // The AIoT API /getAllAcCheckRecordCount usually returns a fixed set, 
        // but we'll try to pass params just in case it supports them now or in future.
        const response = await aiotApi.get(`/getAllAcCheckRecordCount?pageNum=${page}&pageSize=${limit}`);
        const { data } = response;

        if (!data || !data.acCheckRecordList) {
            return res.json([]);
        }

        const records = data.acCheckRecordList.map(record => ({
            id: record.id,
            personName: record.personName,
            personSn: record.personSn,
            deviceName: record.deviceName,
            deviceKey: record.deviceKey,
            createTime: record.createTime,
            passType: record.passType,
            imageUrl: transformImagePath(record.checkImgUri)
        }));

        res.json(records);
    } catch (error) {
        console.error('Error fetching access records:', error.message);
        res.status(500).json({ message: 'Failed to fetch access records', error: error.message });
    }
};

const getDepartments = async (req, res) => {
    try {
        const response = await aiotApi.get('/system/user/deptTree');
        res.json(response.data || []);
    } catch (error) {
        console.error('Error fetching departments:', error.message);
        res.status(500).json({ message: 'Failed to fetch department data', error: error.message });
    }
};

const getAttendanceSummary = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const response = await aiotApi.get(`/attend/attnRecord/attnStaSumDtolist?pageNum=${page}&pageSize=${limit}`);
        res.json({
            total: response.total || 0,
            rows: response.rows || []
        });
    } catch (error) {
        console.error('Error fetching attendance summary:', error.message);
        res.status(500).json({ message: 'Failed to fetch attendance summary', error: error.message });
    }
};

module.exports = {
    getDashboardSummary,
    getDeviceList,
    getAccessRecords,
    getDepartments,
    getAttendanceSummary
};
