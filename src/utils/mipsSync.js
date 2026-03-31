/**
 * mipsSync.js
 * Core utility for syncing CRM persons (members/staff) to MIPS hardware.
 *
 * API Reference Notes:
 *  - POST /personInfo/person returns NO personId — must GET by personSn after create
 *  - PUT /personInfo/person requires FULL object — partial PUT drops fields
 *  - deviceNumType: "4" is REQUIRED for syncPerson
 *  - personSn NOT personNo; mobile NOT phone
 *  - Photo: JPG only, max 400KB
 *  - Success check: code === 200 || code === 0
 */

const axios = require('axios');
const FormData = require('form-data');
const { getMipsClient, getMipsConfig } = require('./mipsHelper');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Strip hyphens for MIPS personSn (MAIN-00001 → MAIN00001)
const toMipsPersonSn = (code = '') => code.replace(/-/g, '');

// Format date for MIPS (YYYY-MM-DD HH:mm:ss)
const formatMipsDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    return d.toISOString().replace('T', ' ').slice(0, 19);
};

// ─────────────────────────────────────────────────────────────
// PERSON OBJECT BUILDERS
// ─────────────────────────────────────────────────────────────

const stripPhone = (phone) => phone ? phone.replace(/\D/g, '') : '';

const getMipsSex = (gender = '') => {
    const val = String(gender).toLowerCase();
    if (val.includes('male') && !val.includes('female')) return "M"; // Working value: M
    if (val.includes('female')) return "F";                         // Working value: F
    return "";                                                      // Default
};

const buildMemberObj = (member) => {
    const rawId = member.memberId || '';
    // Extract last 8 digits from long memberId as cardNo if it looks like a concat
    const cardNo = rawId.length > 9 ? rawId.slice(-8) : null;
    const cleanPhone = stripPhone(member.phone).slice(-10);

    return {
        personSn: toMipsPersonSn(rawId),
        name: member.name || 'Unknown',
        mobile: cleanPhone,
        phonenumber: cleanPhone,
        email: member.email || '',
        gender: getMipsSex(member.gender), // Working field name matches log
        sex: getMipsSex(member.gender),    // Duplicate for safety
        cardNo: cardNo,
        deptId: 100,
        personType: 1,
        attendance: '1',
        holiday: '1',
        validTimeBegin: formatMipsDate(member.joinDate) || '2020-01-01 00:00:00',
        validTimeEnd: formatMipsDate(member.expiryDate) || '2099-12-31 23:59:59',
    };
};

const buildStaffObj = (user) => {
    const code = user.employeeCode || user.email?.split('@')[0] || String(user.id);
    
    let configObj = {};
    if (user.config) {
        try {
            configObj = typeof user.config === 'string' ? JSON.parse(user.config) : user.config;
        } catch (e) {
            console.error('[buildStaffObj] Config parse failed', e);
        }
    }
    const genderStr = configObj.gender || '';
    const cleanPhone = stripPhone(user.phone).slice(-10);

    return {
        personSn: toMipsPersonSn(code),
        name: user.name || 'Unknown',
        mobile: cleanPhone,
        phonenumber: cleanPhone,
        email: user.email || '',
        gender: getMipsSex(genderStr),
        sex: getMipsSex(genderStr),
        deptId: 101, // Staff / Employee ID
        personType: 1,
        attendance: '1',
        holiday: '1',
        validTimeEnd: '2099-12-31 23:59:59',
    };
};

// ─────────────────────────────────────────────────────────────
// MIPS PERSON LOOKUP
// ─────────────────────────────────────────────────────────────

const getMipsPersonBySn = async (personSn, client) => {
    try {
        const res = await client.get(
            `/personInfo/person/list?personSn=${encodeURIComponent(personSn)}&pageNum=1&pageSize=1`
        );
        const rows = res.data?.rows || res.data?.data || [];
        return rows.find(p => p.personSn === personSn) || null;
    } catch (err) {
        console.warn('[mipsSync] Internal person lookup failed:', err.message);
        return null;
    }
};

const cleanForUpdate = (obj) => {
    const forbidden = ['createBy', 'createTime', 'updateBy', 'updateTime', 'remark', 'deptName', 'tenantName', 'havePhoto', 'deptIds', 'palmImg', 'palmFeature', 'palmRightImg', 'palmRightFeature'];
    const cleaned = { ...obj };
    forbidden.forEach(key => delete cleaned[key]);
    return cleaned;
};

// ─────────────────────────────────────────────────────────────
// UPSERT PERSON IN MIPS (Internal API)
// ─────────────────────────────────────────────────────────────
const upsertPersonInMips = async (personObj, branchId) => {
    const client = await getMipsClient(branchId);
    const existing = await getMipsPersonBySn(personObj.personSn, client);

    if (existing) {
        const mergedObj = cleanForUpdate({ ...existing, ...personObj });
        console.log('[mipsSync] Internal Update:', personObj.name);
        const updateRes = await client.put('/personInfo/person', mergedObj);
        
        if (updateRes.data?.code !== 200 && updateRes.data?.code !== 0) {
            throw new Error(updateRes.data?.msg || 'Internal Update Failed');
        }
        return { personId: String(existing.personId), mipsPersonSn: personObj.personSn, action: 'updated' };
    }

    console.log('[mipsSync] Internal Add:', personObj.name);
    const addRes = await client.post('/personInfo/person', personObj);
    if (addRes.data?.code !== 200 && addRes.data?.code !== 0) {
        throw new Error(addRes.data?.msg || 'Internal Add Failed');
    }

    const created = await getMipsPersonBySn(personObj.personSn, client);
    return { personId: String(created?.personId || 0), mipsPersonSn: personObj.personSn, action: 'created' };
};

// ─────────────────────────────────────────────────────────────
// PHOTO UPLOAD (two-step)
// Step 1: POST /common/uploadHeadPhoto  → get fileName
// Step 2: PUT /personInfo/person (full object + photoUri)
// ─────────────────────────────────────────────────────────────

const uploadPhotoToMips = async (imageUrl, branchId) => {
    if (!imageUrl) return null;
    try {
        const client = await getMipsClient(branchId);

        // Download image from source (e.g. Cloudinary)
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const buffer = Buffer.from(imgRes.data);

        // Enforce 400KB limit
        if (buffer.length > 400 * 1024) {
            console.warn('[mipsSync] Photo exceeds 400KB — skipping photo upload');
            return null;
        }

        const form = new FormData();
        form.append('file', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

        const uploadRes = await client.post('/common/uploadHeadPhoto', form, {
            headers: { ...form.getHeaders() },
            timeout: 20000,
        });

        const ok = uploadRes.data?.code === 200 || uploadRes.data?.code === 0;
        if (!ok) {
            console.warn('[mipsSync] Photo upload returned non-success:', uploadRes.data?.msg);
            return null;
        }

        return uploadRes.data.fileName || uploadRes.data.url || null;
    } catch (err) {
        console.warn('[mipsSync] Photo upload failed:', err.message);
        return null;
    }
};

const assignPhotoToPerson = async (personSn, photoUri, branchId) => {
    if (!photoUri) return;
    try {
        const client = await getMipsClient(branchId);
        const person = await getMipsPersonBySn(personSn, client);
        if (!person) return;

        // PUT requires FULL object — partial drops photoUri
        const putRes = await client.put('/personInfo/person', { ...person, photoUri });
        const ok = putRes.data?.code === 200 || putRes.data?.code === 0;
        if (!ok) console.warn('[mipsSync] Photo assign non-success:', putRes.data?.msg);
    } catch (err) {
        console.warn('[mipsSync] Photo assign failed:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────
// GET ALL MIPS DEVICE IDs FOR A BRANCH
// ─────────────────────────────────────────────────────────────

const getBranchDeviceIds = async (branchId) => {
    try {
        const client = await getMipsClient(branchId);
        const res = await client.get('/through/device/getDeviceList');
        const devices = res.data?.rows || [];
        return devices.map(d => d.id || d.deviceId).filter(Boolean);
    } catch (err) {
        console.warn('[mipsSync] Could not fetch device list:', err.message);
        return [];
    }
};

// ─────────────────────────────────────────────────────────────
// SYNC PERSON TO ALL BRANCH DEVICES
// deviceNumType "4" is REQUIRED per API reference
// ─────────────────────────────────────────────────────────────

const syncPersonToDevices = async (mipsPersonId, branchId) => {
    if (!mipsPersonId) return { success: false, reason: 'No mipsPersonId provided' };

    const deviceIds = await getBranchDeviceIds(branchId);
    if (!deviceIds.length) return { success: false, reason: 'No devices found for branch' };

    try {
        const client = await getMipsClient(branchId);
        const res = await client.post('/through/device/syncPerson', {
            personId: parseInt(mipsPersonId),
            deviceIds,
            deviceNumType: '4',  // REQUIRED — do not remove
        });
        const ok = res.data?.code === 200 || res.data?.code === 0;
        return { success: ok, deviceCount: deviceIds.length, response: res.data };
    } catch (err) {
        return { success: false, reason: err.message };
    }
};

// ─────────────────────────────────────────────────────────────
// HARDWARE ACCESS REVOCATION
// Sets validTimeEnd to past date → gate refuses entry immediately
// ─────────────────────────────────────────────────────────────

const revokeHardwareAccess = async (personSn, branchId) => {
    try {
        const client = await getMipsClient(branchId);
        const person = await getMipsPersonBySn(personSn, client);
        if (!person) return { success: false, reason: 'Person not found in MIPS' };

        await client.post('/interface/exterior/updatePerson', {
            ...person,
            validTimeEnd: '2000-01-01 00:00:00',  // Past = blocked
        });

        // Push to devices so hardware enforces immediately
        const syncResult = await syncPersonToDevices(String(person.personId), branchId);
        return { success: true, personId: person.personId, sync: syncResult };
    } catch (err) {
        return { success: false, reason: err.message };
    }
};

// ─────────────────────────────────────────────────────────────
// HARDWARE ACCESS RESTORE
// ─────────────────────────────────────────────────────────────

const restoreHardwareAccess = async (personSn, validTimeEnd, branchId) => {
    try {
        const client = await getMipsClient(branchId);
        const person = await getMipsPersonBySn(personSn, client);
        if (!person) return { success: false, reason: 'Person not found in MIPS' };

        const newExpiry = formatMipsDate(validTimeEnd) || '2099-12-31 23:59:59';
        await client.post('/interface/exterior/updatePerson', {
            ...person,
            validTimeEnd: newExpiry,
        });

        const syncResult = await syncPersonToDevices(String(person.personId), branchId);
        return { success: true, personId: person.personId, validTimeEnd: newExpiry, sync: syncResult };
    } catch (err) {
        return { success: false, reason: err.message };
    }
};


/**
 * SYNC USER TO MIPS (Staff/Trainer/Manager)
 * Full flow: build -> upsert -> upload photo -> sync to devices
 */
const syncUserToMips = async (user) => {
    if (!user || (!user.tenantId && !user.branchId)) {
        console.warn('[mipsSync] Error: User lacks tenantId/branchId during sync');
        return;
    }

    const branchId = user.tenantId || user.branchId;

    try {
        console.log('[mipsSync] Syncing User (Staff):', user.name);

        // 1. Build Payload (Internal Personnel Format)
        const personData = buildStaffObj(user);

        // 2. Add/Update Person
        const upsertRes = await upsertPersonInMips(personData, branchId);
        const personId = upsertRes.personId;

        // 3. Status tracking (DB)
        const prisma = require('../config/prisma');
        await prisma.user.update({
            where: { id: user.id },
            data: {
                mipsPersonSn: upsertRes.mipsPersonSn,
                mipsPersonId: personId,
                mipsSyncStatus: 'synced',
                mipsSyncedAt: new Date(),
            },
        });

        // 4. Photo Handling (Optional Background)
        if (user.avatar) {
            uploadPhotoToMips(user.avatar, branchId).then(photoUri => {
                if (photoUri) {
                    assignPhotoToPerson(upsertRes.mipsPersonSn, photoUri, branchId).then(() => {
                        console.log('[mipsSync] Photo synced for:', user.name);
                        syncPersonToDevices(personId, branchId);
                    });
                }
            });
        }

        // 5. Initial Sync to Devices
        const syncRes = await syncPersonToDevices(personId, branchId);
        console.log('[mipsSync] Final Device Sync:', syncRes.success ? 'SUCCESS' : 'FAILED', syncRes.reason || '');

        return { success: true, ...upsertRes };
    } catch (err) {
        console.error('[mipsSync] SyncUserToMips Error:', err.message);
        
        // Mark as failed in DB
        const prisma = require('../config/prisma');
        try {
            await prisma.user.update({
                where: { id: user.id },
                data: { mipsSyncStatus: 'failed' }
            });
        } catch (e) {}
        
        return { success: false, error: err.message };
    }
};

module.exports = {
    toMipsPersonSn,
    buildMemberObj,
    buildStaffObj,
    getMipsPersonBySn,
    upsertPersonInMips,
    uploadPhotoToMips,
    assignPhotoToPerson,
    getBranchDeviceIds,
    syncPersonToDevices,
    revokeHardwareAccess,
    restoreHardwareAccess,
    syncUserToMips,
};
