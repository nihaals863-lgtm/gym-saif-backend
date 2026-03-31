/**
 * gymDevice.controller.js
 * Branch-aware MIPS AIoT data controller.
 *
 * Filtering rule:
 *   Only MIPS data whose deviceKey exists in OUR DB is returned.
 *   Deleted devices stay in MIPS but are hidden from all UI responses.
 */

const { PrismaClient } = require('@prisma/client');
const { getMipsClient } = require('../utils/mipsHelper');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// HELPER: resolve branchId from request
// SuperAdmin: from x-tenant-id header (null = global env)
// Others: always their own tenantId
// ─────────────────────────────────────────────────────────────
const getBranchId = (req) => {
    const { role, tenantId } = req.user;
    const header = req.headers['x-tenant-id'];

    if (role === 'SUPER_ADMIN') {
        if (header && header !== 'all' && header !== 'undefined') {
            return parseInt(header);
        }
        return null; // global — use env vars
    }
    return parseInt(tenantId);
};

// ─────────────────────────────────────────────────────────────
// HELPER: fetch allowed deviceKeys from our DB
//   branchId = null  → SuperAdmin global = ALL registered devices
//   branchId = N     → only that branch's devices
// Returns a Set<string> for O(1) lookup
// ─────────────────────────────────────────────────────────────
const getAllowedDeviceKeys = async (branchId) => {
    const where = {};
    if (branchId) where.branchId = branchId;

    const devices = await prisma.device.findMany({
        where,
        select: { deviceKey: true }
    });

    // Filter out null/empty deviceKeys
    return new Set(
        devices
            .map(d => d.deviceKey)
            .filter(Boolean)
    );
};

// ─────────────────────────────────────────────────────────────
// HELPER: transform MIPS relative image paths to full URLs
// ─────────────────────────────────────────────────────────────
const transformImagePath = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const base = (process.env.AIOT_BASE_URL || 'http://212.38.94.228:9000').replace(/\/$/, '');
    return `${base}${path}`;
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/gym-device/dashboard
// ─────────────────────────────────────────────────────────────
const getDashboardSummary = async (req, res) => {
    try {
        const branchId = getBranchId(req);

        // Step 1 — allowed deviceKeys from our DB
        const allowedKeys = await getAllowedDeviceKeys(branchId);

        const client = await getMipsClient(branchId);

        const [recordsRes, deviceListRes] = await Promise.all([
            client.get('/getAllAcCheckRecordCount'),
            client.get('/through/device/getDeviceList')
        ]);

        const { data } = recordsRes.data;
        const allMipsDevices = deviceListRes.data?.rows || [];

        if (!data) {
            return res.status(500).json({ message: 'No data received from AIoT system' });
        }

        // Step 2 — filter MIPS device list to only registered devices
        const filteredDevices = allMipsDevices.filter(d =>
            d.deviceKey && allowedKeys.has(d.deviceKey)
        );

        // Step 3 — filter access records to only registered devices
        const allRecords = data.acCheckRecordList || [];
        const filteredRecords = allRecords.filter(r =>
            r.deviceKey && allowedKeys.has(r.deviceKey)
        );

        // Step 4 — recalculate counts from filtered devices/records
        const onlineCount = filteredDevices.filter(d => d.onlineFlag === 1).length;
        const offlineCount = filteredDevices.length - onlineCount;

        // If no devices are registered in our DB → return all zeros
        // Otherwise use MIPS aggregates (scoped to this branch's MIPS connection)
        const noDevices = allowedKeys.size === 0;

        res.json({
            onlineCount,
            offlineCount,
            totalDevices: filteredDevices.length,
            totalCountToday: noDevices ? 0 : (data.acCheckRecordMap?.totalCount || 0),
            totalCountAll: noDevices ? 0 : (data.acCheckRecordMap?.totalCountTal || 0),
            employeeCountToday: noDevices ? 0 : (data.acCheckRecordMap?.employeeCount || 0),
            employeeCountAll: noDevices ? 0 : (data.acCheckRecordMap?.employeeCountTal || 0),
            visitorCountToday: noDevices ? 0 : (data.acCheckRecordMap?.visitorCount || 0),
            visitorCountAll: noDevices ? 0 : (data.acCheckRecordMap?.visitorCountTal || 0),
            alcoholCountToday: noDevices ? 0 : (data.acCheckRecordMap?.alcoholCount || 0),
            alcoholCountAll: noDevices ? 0 : (data.acCheckRecordMap?.alcoholCountTal || 0),
            records: filteredRecords.slice(0, 10).map(record => ({
                id: record.id,
                personName: record.personName,
                personSn: record.personSn,
                deviceName: record.deviceName,
                deviceKey: record.deviceKey,
                createTime: record.createTime,
                passType: record.passType,
                imageUrl: transformImagePath(record.checkImgUri)
            }))
        });
    } catch (error) {
        console.error('[getDashboardSummary]', error.message);
        res.status(500).json({ message: 'Failed to fetch AIoT dashboard data', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/gym-device/devices
// ─────────────────────────────────────────────────────────────
const getDeviceList = async (req, res) => {
    try {
        const branchId = getBranchId(req);

        // Step 1 — allowed deviceKeys from our DB
        const allowedKeys = await getAllowedDeviceKeys(branchId);

        const client = await getMipsClient(branchId);

        const [deviceListRes, recordsRes, configRes] = await Promise.all([
            client.get('/through/device/getDeviceList'),
            client.get('/getAllAcCheckRecordCount'),
            client.get('/through/device/getDeviceTypeConfig')
        ]);

        const allMipsDevices = deviceListRes.data?.rows || [];
        const { data: recordData } = recordsRes.data;
        const connectionType = configRes.data?.data;

        // Step 2 — filter to only our registered devices
        const filteredDevices = allMipsDevices.filter(d =>
            d.deviceKey && allowedKeys.has(d.deviceKey)
        );

        const devices = filteredDevices.map(device => {
            const lastRecord = recordData?.acCheckRecordList?.find(r => r.deviceKey === device.deviceKey);
            return {
                deviceName: device.deviceName,
                deviceKey: device.deviceKey,
                status: device.onlineFlag === 1 ? 'online' : 'offline',
                connectionType: (connectionType || 'WAN').toUpperCase(),
                todayEntries: recordData?.acCheckRecordMap?.totalCount || 0,
                lastSeen: device.lastActiveTime || lastRecord?.createTime,
                lastPersonName: lastRecord?.personName || 'No recent activity'
            };
        });

        res.json(devices);
    } catch (error) {
        console.error('[getDeviceList]', error.message);
        res.status(500).json({ message: 'Failed to fetch device data', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/gym-device/records
// ─────────────────────────────────────────────────────────────
const getAccessRecords = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const branchId = getBranchId(req);

        // Step 1 — allowed deviceKeys from our DB
        const allowedKeys = await getAllowedDeviceKeys(branchId);

        const client = await getMipsClient(branchId);
        const response = await client.get(`/getAllAcCheckRecordCount?pageNum=${page}&pageSize=${limit}`);
        const { data } = response.data;

        if (!data || !data.acCheckRecordList) return res.json([]);

        // Step 2 — filter records to only registered devices
        const filteredRecords = data.acCheckRecordList.filter(r =>
            r.deviceKey && allowedKeys.has(r.deviceKey)
        );

        const records = filteredRecords.map(record => ({
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
        console.error('[getAccessRecords]', error.message);
        res.status(500).json({ message: 'Failed to fetch access records', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/gym-device/departments
// ─────────────────────────────────────────────────────────────
const getDepartments = async (req, res) => {
    try {
        const branchId = getBranchId(req);
        const client = await getMipsClient(branchId);
        const response = await client.get('/system/user/deptTree');
        res.json(response.data?.data || []);
    } catch (error) {
        console.error('[getDepartments]', error.message);
        res.status(500).json({ message: 'Failed to fetch department data', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/gym-device/attendance-summary
// ─────────────────────────────────────────────────────────────
const getAttendanceSummary = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const branchId = getBranchId(req);
        const client = await getMipsClient(branchId);

        const response = await client.get(`/attend/attnRecord/attnStaSumDtolist?pageNum=${page}&pageSize=${limit}`);
        res.json({
            total: response.data?.total || 0,
            rows: response.data?.rows || []
        });
    } catch (error) {
        console.error('[getAttendanceSummary]', error.message);
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
