/**
 * device.controller.js
 * Multi-branch device management with MIPS validation.
 *
 * Roles:
 *   SUPER_ADMIN  → sees ALL devices, can filter by branchId
 *   Others       → see ONLY their own branch devices (tenantId = branchId)
 */

const { PrismaClient } = require('@prisma/client');
const { getMipsConfig, loginToMips, getMipsDeviceList, getMipsClient } = require('../utils/mipsHelper');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// HELPER: resolve branchId from request
// ─────────────────────────────────────────────────────────────
const resolveBranchId = (req, overrideId = null) => {
    const { role, tenantId } = req.user;
    if (role === 'SUPER_ADMIN') {
        return overrideId ? parseInt(overrideId) : null; // null = all branches
    }
    return parseInt(tenantId); // always locked to own branch
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/devices
// SuperAdmin: all (or filtered by ?branchId=)
// Others: own branch only
// ─────────────────────────────────────────────────────────────
const getDevices = async (req, res) => {
    try {
        const { role } = req.user;
        const branchId = resolveBranchId(req, req.query.branchId);

        const where = {};
        if (role === 'SUPER_ADMIN') {
            if (branchId) where.branchId = branchId;
            // else → no filter = all devices
        } else {
            where.branchId = branchId;
        }

        const devices = await prisma.device.findMany({
            where,
            orderBy: { lastSeen: 'desc' }
        });

        res.json(devices);
    } catch (error) {
        console.error('[getDevices]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/devices
// STRICT MIPS validation — device MUST exist in MIPS before save.
//
//   Step 1: Validate required input (name, ip, type, deviceKey)
//   Step 2: Reject duplicate deviceKey in DB
//   Step 3: Fetch branch MIPS config
//   Step 4: Login to MIPS — hard fail if credentials invalid
//   Step 5: Fetch device list from MIPS
//   Step 6: Verify deviceKey exists — hard fail if not found
//   Step 7: Save to DB with status = "connected"
//   Step 8: Return success response
// ─────────────────────────────────────────────────────────────
const addDevice = async (req, res) => {
    try {
        const { role, tenantId: userTenantId } = req.user;
        const {
            name, ip, deviceKey, type,
            branch_id, company_id, sdk_type,
            port, protocol,
            sdkApiKey, sdkApiSecret, deviceToken
        } = req.body;

        // ── Step 1: Validate required fields ──────────────────
        if (!name || !ip || !type || !deviceKey) {
            return res.status(400).json({
                success: false,
                message: 'name, ip, type, and deviceKey are required'
            });
        }

        const branchId = role === 'SUPER_ADMIN'
            ? (branch_id ? parseInt(branch_id) : null)
            : parseInt(userTenantId);

        // ── Step 2: Reject duplicate deviceKey ────────────────
        const existing = await prisma.device.findFirst({ where: { deviceKey } });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Device with deviceKey "${deviceKey}" is already registered`
            });
        }

        // ── Step 3: Get branch MIPS config ────────────────────
        const mipsConfig = await getMipsConfig(branchId);

        // ── Step 4: Login to MIPS (hard fail) ─────────────────
        let mipsToken;
        try {
            mipsToken = await loginToMips(mipsConfig);
        } catch (err) {
            return res.status(503).json({
                success: false,
                message: `MIPS login failed: ${err.message}`,
                hint: 'Verify the MIPS server URL and credentials in Settings → MIPS Connections'
            });
        }

        // ── Step 5: Fetch device list from MIPS ───────────────
        let mipsDevices;
        try {
            mipsDevices = await getMipsDeviceList(branchId);
        } catch (err) {
            return res.status(503).json({
                success: false,
                message: `Failed to retrieve device list from MIPS: ${err.message}`
            });
        }

        // ── Step 6: Validate deviceKey exists in MIPS ─────────
        // MIPS may return the key as: deviceKey | sn | serialNo | serialNumber
        const mipsDevice = mipsDevices.find(d =>
            d.deviceKey === deviceKey ||
            d.sn === deviceKey ||
            d.serialNo === deviceKey ||
            d.serialNumber === deviceKey
        );

        if (!mipsDevice) {
            return res.status(404).json({
                success: false,
                message: 'Device not found in MIPS. Please connect device first.',
                hint: `deviceKey "${deviceKey}" was not found in the MIPS device list. Ensure the device is physically connected and registered in the MIPS portal before adding it here.`
            });
        }

        // ── Step 7: Resolve SDK keys from mips_connections if not provided ──
        let resolvedApiKey = sdkApiKey || null;
        let resolvedApiSecret = sdkApiSecret || null;
        if ((!resolvedApiKey || !resolvedApiSecret) && branchId) {
            const mipsConn = await prisma.mipsConnection.findUnique({ where: { branchId } });
            if (mipsConn) {
                resolvedApiKey = resolvedApiKey || mipsConn.sdkApiKey || null;
                resolvedApiSecret = resolvedApiSecret || mipsConn.sdkApiSecret || null;
            }
        }

        // ── Step 8: Save to DB ─────────────────────────────────
        const device = await prisma.device.create({
            data: {
                name,
                ipAddress: ip,
                deviceKey,
                type,
                status: 'connected',
                port: port ? parseInt(port) : 80,
                protocol: protocol || 'HTTP',
                sdkType: sdk_type || 'SmartAIoT',
                sdkApiKey: resolvedApiKey,
                sdkApiSecret: resolvedApiSecret,
                deviceToken: deviceToken || null,
                branchId: branchId || null,
                companyId: company_id ? parseInt(company_id) : null,
                lastSeen: new Date()
            }
        });

        console.log(`[addDevice] Device "${name}" (${deviceKey}) registered. MIPS match: ${mipsDevice.name || mipsDevice.deviceName || 'unnamed'}`);

        // ── Step 8: Respond ────────────────────────────────────
        return res.status(201).json({
            success: true,
            message: 'Device added successfully',
            data: device
        });

    } catch (error) {
        console.error('[addDevice]', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/devices/:id
// ─────────────────────────────────────────────────────────────
const updateDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId } = req.user;

        const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        // Branch-level guard
        if (role !== 'SUPER_ADMIN' && device.branchId !== parseInt(tenantId)) {
            return res.status(403).json({ message: 'Access denied: not your branch device' });
        }

        // Build update payload — only include provided fields
        const updateData = {};
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.ip !== undefined) updateData.ipAddress = req.body.ip;
        if (req.body.type !== undefined) updateData.type = req.body.type;
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.port !== undefined) updateData.port = parseInt(req.body.port);
        if (req.body.protocol !== undefined) updateData.protocol = req.body.protocol;
        if (req.body.sdkType !== undefined) updateData.sdkType = req.body.sdkType;
        if (req.body.sdkApiKey !== undefined) updateData.sdkApiKey = req.body.sdkApiKey;
        if (req.body.sdkApiSecret !== undefined) updateData.sdkApiSecret = req.body.sdkApiSecret;
        if (req.body.deviceToken !== undefined) updateData.deviceToken = req.body.deviceToken;
        if (req.body.deviceKey !== undefined) updateData.deviceKey = req.body.deviceKey;
        if (req.body.branchId !== undefined && role === 'SUPER_ADMIN') {
            updateData.branchId = parseInt(req.body.branchId);
        }

        const updated = await prisma.device.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('[updateDevice]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/devices/:id
// ─────────────────────────────────────────────────────────────
const deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId } = req.user;

        const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        if (role !== 'SUPER_ADMIN' && device.branchId !== parseInt(tenantId)) {
            return res.status(403).json({ message: 'Access denied: not your branch device' });
        }

        await prisma.device.delete({ where: { id: parseInt(id) } });
        res.json({ success: true, message: 'Device decommissioned successfully' });
    } catch (error) {
        console.error('[deleteDevice]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/devices/mips-connections   [SuperAdmin only]
// ─────────────────────────────────────────────────────────────
const getMipsConnections = async (req, res) => {
    try {
        const connections = await prisma.mipsConnection.findMany({
            orderBy: { branchId: 'asc' }
        });
        res.json(connections);
    } catch (error) {
        console.error('[getMipsConnections]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/devices/mips-connections  [SuperAdmin only]
// Create or update MIPS config for a branch (tests connection first)
// ─────────────────────────────────────────────────────────────
const upsertMipsConnection = async (req, res) => {
    try {
        const { branchId, serverUrl, username, password, tenantId, isActive, sdkApiKey, sdkApiSecret } = req.body;

        if (!branchId || !serverUrl || !username || !password) {
            return res.status(400).json({
                message: 'branchId, serverUrl, username, password are required'
            });
        }

        // Test connection before saving
        try {
            await loginToMips({
                serverUrl: serverUrl.replace(/\/$/, ''),
                username,
                password,
                tenantId: tenantId || '1'
            });
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: `MIPS connection test failed: ${e.message}`
            });
        }

        const conn = await prisma.mipsConnection.upsert({
            where: { branchId: parseInt(branchId) },
            create: {
                branchId: parseInt(branchId),
                serverUrl: serverUrl.replace(/\/$/, ''),
                username,
                password,
                tenantId: tenantId || '1',
                isActive: isActive !== false,
                sdkApiKey: sdkApiKey || null,
                sdkApiSecret: sdkApiSecret || null,
            },
            update: {
                serverUrl: serverUrl.replace(/\/$/, ''),
                username,
                password,
                tenantId: tenantId || '1',
                isActive: isActive !== false,
                ...(sdkApiKey !== undefined && { sdkApiKey }),
                ...(sdkApiSecret !== undefined && { sdkApiSecret }),
            }
        });

        res.json({ success: true, message: 'MIPS connection saved', data: conn });
    } catch (error) {
        console.error('[upsertMipsConnection]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/devices/mips-connections/:branchId [SuperAdmin]
// ─────────────────────────────────────────────────────────────
const deleteMipsConnection = async (req, res) => {
    try {
        const { branchId } = req.params;
        await prisma.mipsConnection.delete({ where: { branchId: parseInt(branchId) } });
        res.json({ success: true, message: 'MIPS connection removed' });
    } catch (error) {
        console.error('[deleteMipsConnection]', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// HELPER: find MIPS device ID by our DB device's deviceKey
// ─────────────────────────────────────────────────────────────
const getMipsDeviceId = async (dbDevice, branchId) => {
    const list = await getMipsDeviceList(branchId);
    const match = list.find(d => d.deviceKey === dbDevice.deviceKey);
    return match ? (match.id || match.deviceId) : null;
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/devices/:id/open-door
// Remote unlock — calls MIPS openDoor endpoint
// ─────────────────────────────────────────────────────────────
const openDoor = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId } = req.user;

        const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
        if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

        if (role !== 'SUPER_ADMIN' && device.branchId !== parseInt(tenantId)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const mipsDeviceId = await getMipsDeviceId(device, device.branchId);
        if (!mipsDeviceId) {
            return res.status(404).json({
                success: false,
                message: 'Device not found in MIPS. Ensure deviceKey matches.'
            });
        }

        const client = await getMipsClient(device.branchId);
        const mipsRes = await client.get(`/through/device/openDoor/${mipsDeviceId}`);
        const ok = mipsRes.data?.code === 200 || mipsRes.data?.code === 0;

        if (!ok) {
            return res.status(400).json({
                success: false,
                message: mipsRes.data?.msg || 'MIPS openDoor failed'
            });
        }

        console.log(`[openDoor] Device "${device.name}" (${device.deviceKey}) opened by user ${req.user.id}`);
        res.json({ success: true, message: `Door opened: ${device.name}` });

    } catch (error) {
        console.error('[openDoor]', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/devices/:id/reboot
// Remote reboot — calls MIPS reboot endpoint
// ─────────────────────────────────────────────────────────────
const rebootDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tenantId } = req.user;

        const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
        if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

        if (role !== 'SUPER_ADMIN' && device.branchId !== parseInt(tenantId)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const mipsDeviceId = await getMipsDeviceId(device, device.branchId);
        if (!mipsDeviceId) {
            return res.status(404).json({
                success: false,
                message: 'Device not found in MIPS'
            });
        }

        const client = await getMipsClient(device.branchId);
        // NOTE: Endpoint is /reboot NOT /restart
        const mipsRes = await client.get(`/through/device/reboot/${mipsDeviceId}`);
        const ok = mipsRes.data?.code === 200 || mipsRes.data?.code === 0;

        if (!ok) {
            return res.status(400).json({
                success: false,
                message: mipsRes.data?.msg || 'MIPS reboot failed'
            });
        }

        console.log(`[rebootDevice] Device "${device.name}" rebooted by user ${req.user.id}`);
        res.json({ success: true, message: `Reboot command sent to: ${device.name}` });

    } catch (error) {
        console.error('[rebootDevice]', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getDevices,
    addDevice,
    updateDevice,
    deleteDevice,
    getMipsConnections,
    upsertMipsConnection,
    deleteMipsConnection,
    openDoor,
    rebootDevice,
};
