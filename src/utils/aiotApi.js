const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

let cachedToken = null;

const AIOT_BASE_URL = (process.env.AIOT_BASE_URL || 'http://212.38.94.228:9000').trim();
const AIOT_USERNAME = process.env.AIOT_USERNAME?.trim();
const AIOT_PASSWORD = process.env.AIOT_PASSWORD?.trim();

/**
 * Login to Smart AIoT system to get JWT token
 */
const login = async () => {
    try {
        const payload = {
            username: AIOT_USERNAME,
            password: AIOT_PASSWORD,
            code: "",
            uuid: ""
        };

        const headers = {
            'tenant-id': process.env.AIOT_TENANT_ID || "1"
        };

        console.log(`[AIoT] Attempting login to ${AIOT_BASE_URL}/login...`);
        const response = await axios.post(`${AIOT_BASE_URL}/login`, payload, { headers });

        if (response.data && response.data.code === 200 && response.data.token) {
            cachedToken = response.data.token;
            console.log('[AIoT] Login successful, token cached.');
            return cachedToken;
        } else {
            console.error('[AIoT] Login failed:', response.data?.msg || 'Invalid response');
            throw new Error(response.data?.msg || 'Authentication failed');
        }
    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('[AIoT] Login error:', errorMsg);
        throw new Error('Smart AIoT authentication failed');
    }
};

/**
 * Core request helper with authentication and auto-token-refresh
 */
const request = async (method, endpoint, data = null, params = null) => {
    if (!cachedToken) {
        await login();
    }

    const fullUrl = `${AIOT_BASE_URL}${endpoint}`;
    // Sensitive headers should not be logged entirely, but logging the request is helpful
    console.log(`[AIoT] ${method.toUpperCase()} ${fullUrl}`);

    const config = {
        method,
        url: fullUrl,
        headers: {
            'Authorization': `Bearer ${cachedToken}`,
            'tenant-id': process.env.AIOT_TENANT_ID || "1"
        },
        data,
        params,
        timeout: 10000 // 10s timeout
    };

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        // If 401 Unauthorized, try to refresh token and retry once
        if (error.response && error.response.status === 401) {
            console.warn('[AIoT] Token expired or invalid, refreshing...');
            try {
                await login();
                config.headers['Authorization'] = `Bearer ${cachedToken}`;
                const retryResponse = await axios(config);
                return retryResponse.data;
            } catch (retryError) {
                console.error('[AIoT] Retry after refresh failed:', retryError.message);
                throw new Error('Smart AIoT access unauthorized');
            }
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('Network Error')) {
            console.error('[AIoT] Service unavailable:', error.message);
            throw new Error('Smart AIoT service unavailable');
        }

        console.error(`[AIoT] Request failed for ${endpoint}:`, error.message);
        throw error;
    }
};

module.exports = {
    get: (endpoint, params) => request('get', endpoint, null, params),
    post: (endpoint, data) => request('post', endpoint, data),
    login
};
