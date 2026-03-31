/**
 * mipsHelper.js
 * Per-branch MIPS connection manager.
 * Each branch can have its own MIPS server URL, credentials.
 * Falls back to global env vars if no branch config exists.
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Token cache: { "branchId" | "default" → { token, expiresAt } }
const tokenCache = {};

// ─────────────────────────────────────────────
// 1. Get MIPS config for a branch (or global)
// ─────────────────────────────────────────────
const getMipsConfig = async (branchId) => {
    if (branchId) {
        try {
            const conn = await prisma.mipsConnection.findUnique({
                where: { branchId: parseInt(branchId) }
            });
            if (conn && conn.isActive) {
                return {
                    serverUrl: conn.serverUrl.replace(/\/$/, ''),
                    username: conn.username,
                    password: conn.password,
                    tenantId: conn.tenantId || '1'
                };
            }
        } catch (err) {
            console.warn(`[mipsHelper] Could not fetch branch config for branchId=${branchId}:`, err.message);
        }
    }

    // Fallback to global env vars
    return {
        serverUrl: (process.env.AIOT_BASE_URL || 'http://212.38.94.228:9000').replace(/\/$/, ''),
        username: process.env.AIOT_USERNAME || 'admin',
        password: process.env.AIOT_PASSWORD || 'admin123',
        tenantId: process.env.AIOT_TENANT_ID || '1'
    };
};

// ─────────────────────────────────────────────
// 2. Login to MIPS and return token
// ─────────────────────────────────────────────
const loginToMips = async (config) => {
    console.log(`[mipsHelper] Logging in to MIPS at ${config.serverUrl}...`);
    const response = await axios.post(
        `${config.serverUrl}/login`,
        { username: config.username, password: config.password, code: '', uuid: '' },
        {
            headers: { 'tenant-id': config.tenantId, 'Content-Type': 'application/json' },
            timeout: 10000
        }
    );

    // MIPS returns code 200 or 0 on success
    if ((response.data?.code === 200 || response.data?.code === 0) && response.data?.token) {
        console.log('[mipsHelper] MIPS login successful.');
        return response.data.token;
    }
    throw new Error(response.data?.msg || 'MIPS login failed — invalid credentials');
};

// ─────────────────────────────────────────────
// 3. Get authenticated axios client (with token cache)
// ─────────────────────────────────────────────
const getMipsClient = async (branchId) => {
    const cacheKey = branchId ? String(branchId) : 'default';
    const config = await getMipsConfig(branchId);

    // Reuse cached token if still valid (7h window)
    const cached = tokenCache[cacheKey];
    let token;

    if (cached && cached.expiresAt > Date.now()) {
        token = cached.token;
    } else {
        token = await loginToMips(config);
        tokenCache[cacheKey] = {
            token,
            expiresAt: Date.now() + 7 * 60 * 60 * 1000
        };
    }

    const client = axios.create({
        baseURL: config.serverUrl,
        headers: {
            Authorization: `Bearer ${token}`,
            'tenant-id': config.tenantId,
            'Content-Type': 'application/json'
        },
        timeout: 10000
    });

    // Auto-retry on 401
    client.interceptors.response.use(
        (res) => res,
        async (err) => {
            if (err.response?.status === 401) {
                console.warn('[mipsHelper] Token expired, refreshing...');
                delete tokenCache[cacheKey];
                const newToken = await loginToMips(config);
                tokenCache[cacheKey] = { token: newToken, expiresAt: Date.now() + 7 * 60 * 60 * 1000 };
                err.config.headers['Authorization'] = `Bearer ${newToken}`;
                return axios(err.config);
            }
            return Promise.reject(err);
        }
    );

    return client;
};

// ─────────────────────────────────────────────
// 4. Fetch device list from MIPS
//    Tries primary endpoint, falls back to alternate.
//    Returns normalized array — always has at least: { deviceKey, sn, name }
// ─────────────────────────────────────────────
const getMipsDeviceList = async (branchId) => {
    const client = await getMipsClient(branchId);

    // Primary endpoint (RuoYi-Vue v3 through-proxy)
    try {
        const res = await client.get('/through/device/getDeviceList');
        const rows = res.data?.rows || res.data?.data || [];
        if (rows.length > 0) return rows;
        // Empty list is valid — fall through to alternate only on error
        return rows;
    } catch (primaryErr) {
        console.warn('[mipsHelper] Primary device list endpoint failed, trying alternate...', primaryErr.message);
    }

    // Alternate endpoint (some MIPS versions)
    const res = await client.get('/device/list');
    return res.data?.rows || res.data?.data || res.data || [];
};

// ─────────────────────────────────────────────
// 5. Invalidate token cache for a branch
// ─────────────────────────────────────────────
const clearTokenCache = (branchId) => {
    const key = branchId ? String(branchId) : 'default';
    delete tokenCache[key];
};

module.exports = {
    getMipsConfig,
    loginToMips,
    getMipsClient,
    getMipsDeviceList,
    clearTokenCache
};
