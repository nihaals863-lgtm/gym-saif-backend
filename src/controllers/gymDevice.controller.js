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
        // If no devices are registered for this branch, fall back to showing ALL MIPS devices
        // (same as admin view — manager should see their gym's hardware)
        const filteredDevices = allowedKeys.size > 0
            ? allMipsDevices.filter(d => d.deviceKey && allowedKeys.has(d.deviceKey))
            : allMipsDevices; // fallback: show all when branch has no specific device records

        // Step 3 — Fetch recent records from local DB
        // Always include personTenantId fallback so manager sees their branch logs
        // even if the device is registered under a different branchId (e.g., global/superadmin)
        const recordsWhere = {};
        if (branchId) {
            const deviceKeyArr = Array.from(allowedKeys);
            const orConditions = [{ personTenantId: branchId }];
            if (deviceKeyArr.length > 0) {
                orConditions.unshift({ deviceKey: { in: deviceKeyArr } });
            }
            // Also include devices from all MIPS devices if no registered ones
            if (allowedKeys.size === 0) {
                const allMipsKeys = allMipsDevices.map(d => d.deviceKey).filter(Boolean);
                if (allMipsKeys.length > 0) {
                    orConditions.unshift({ deviceKey: { in: allMipsKeys } });
                }
            }
            recordsWhere.OR = orConditions;
        } else {
            // SuperAdmin global view — all devices
            if (allowedKeys.size > 0) {
                recordsWhere.deviceKey = { in: Array.from(allowedKeys) };
            }
            // else: no filter = show all
        }

        const recentLogs = await prisma.accessLog.findMany({
            where: recordsWhere,
            take: 10,
            orderBy: { scanTime: 'desc' }
        });

        const formattedRecords = recentLogs.map(record => ({
            id: record.id,
            personName: record.personName || 'Stranger',
            personSn: record.personId,
            deviceName: record.deviceName || 'Device',
            deviceKey: record.deviceKey,
            createTime: record.scanTime,
            passType: record.passType,
            imageUrl: transformImagePath(record.imageUrl)
        }));

        // Step 4 — recalculate counts from filtered devices/records
        const onlineCount = filteredDevices.filter(d => d.onlineFlag === 1).length;
        const offlineCount = filteredDevices.length - onlineCount;

        // Use MIPS aggregates for totals (since they aggregate over time)
        // BUT use our local records for the list
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
            records: formattedRecords
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
        // If branch has no registered devices, fall back to showing ALL MIPS devices
        const filteredDevices = allowedKeys.size > 0
            ? allMipsDevices.filter(d => d.deviceKey && allowedKeys.has(d.deviceKey))
            : allMipsDevices; // fallback for manager view

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
        const { page = 1, limit = 50, search, date, branchId: queryBranchId } = req.query;
        const branchId = getBranchId(req) || (queryBranchId ? parseInt(queryBranchId) : null);

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = { AND: [] };
        if (branchId) {
            where.AND.push({
                OR: [
                    { branchId: branchId },
                    { personTenantId: branchId }
                ]
            });
        }

        // 🔥 Added: Date Filtering (Robust)
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            
            where.AND.push({
                scanTime: {
                    gte: start,
                    lte: end
                }
            });
        }

        if (search) {
            where.AND.push({
                OR: [
                    { personName: { contains: search } },
                    { personId: { contains: search } },
                    { deviceName: { contains: search } }
                ]
            });
        }

        const [records, total] = await Promise.all([
            prisma.accessLog.findMany({
                where: where.AND.length > 0 ? where : {},
                orderBy: { scanTime: 'desc' },
                skip,
                take
            }),
            prisma.accessLog.count({ where: where.AND.length > 0 ? where : {} })
        ]);

        const formatted = records.map(record => ({
            id: record.id,
            personName: record.personName || 'Stranger',
            personSn: record.personId,
            deviceName: record.deviceName || 'MIPS Device',
            deviceKey: record.deviceKey,
            createTime: record.scanTime,
            passType: record.passType,
            imageUrl: transformImagePath(record.imageUrl),
            personTenantId: record.personTenantId,
            scanTime: record.scanTime
        }));

        res.json({
            data: {
                acCheckRecordList: formatted,
                acCheckRecordMap: {
                    totalCountTal: total
                }
            }
        });
    } catch (error) {
        console.error('[getAccessRecords]', error.message);
        res.status(500).json({ message: 'Failed to fetch local access records', error: error.message });
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
