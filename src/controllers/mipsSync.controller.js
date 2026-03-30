/**
 * mipsSync.controller.js
 *
 * Endpoints:
 *   POST /api/v1/mips-sync/member/:memberId    → sync member to MIPS + devices
 *   POST /api/v1/mips-sync/staff/:userId       → sync staff/trainer to MIPS + devices
 *   POST /api/v1/mips-sync/revoke/:memberId    → revoke member hardware access
 *   POST /api/v1/mips-sync/restore/:memberId   → restore member hardware access
 *   GET  /api/v1/mips-sync/status/member/:memberId
 *   GET  /api/v1/mips-sync/status/staff/:userId
 */

const { PrismaClient } = require('@prisma/client');
const {
    buildMemberObj,
    buildStaffObj,
    upsertPersonInMips,
    uploadPhotoToMips,
    assignPhotoToPerson,
    syncPersonToDevices,
    revokeHardwareAccess,
    restoreHardwareAccess,
} = require('../utils/mipsSync');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// HELPER: resolve branchId (SuperAdmin can override via body)
// ─────────────────────────────────────────────────────────────
const resolveBranchId = (req) => {
    const { role, tenantId } = req.user;
    if (role === 'SUPER_ADMIN') {
        return req.body.branchId ? parseInt(req.body.branchId) : null;
    }
    return parseInt(tenantId);
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/mips-sync/member/:memberId
// Full sync: create/update person in MIPS → photo → devices
// ─────────────────────────────────────────────────────────────
const syncMember = async (req, res) => {
    const { memberId } = req.params;
    const branchId = resolveBranchId(req);
    const steps = [];

    try {
        // 1. Fetch member from DB
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

        // 2. Build person object
        const personObj = buildMemberObj(member);
        steps.push({ step: 'build', personSn: personObj.personSn });

        // 3. Upsert in MIPS (add or update)
        const { personId, action } = await upsertPersonInMips(personObj, branchId || member.tenantId);
        steps.push({ step: 'upsert', action, personId });

        // 4. Upload photo if member has avatar
        let photoUri = null;
        if (member.avatar) {
            photoUri = await uploadPhotoToMips(member.avatar, branchId || member.tenantId);
            steps.push({ step: 'photo_upload', photoUri: photoUri ? 'success' : 'skipped' });

            if (photoUri) {
                await assignPhotoToPerson(personObj.personSn, photoUri, branchId || member.tenantId);
                steps.push({ step: 'photo_assign', status: 'done' });
            }
        }

        // 5. Sync to all branch devices
        const syncResult = await syncPersonToDevices(personId, branchId || member.tenantId);
        steps.push({ step: 'device_sync', ...syncResult });

        // 6. Update DB with MIPS person info
        await prisma.member.update({
            where: { id: member.id },
            data: {
                mipsPersonSn: personObj.personSn,
                mipsPersonId: personId,
                mipsSyncStatus: 'synced',
                mipsSyncedAt: new Date(),
            }
        });

        return res.json({
            success: true,
            message: `Member "${member.name}" ${action} in MIPS and synced to ${syncResult.deviceCount || 0} device(s)`,
            personSn: personObj.personSn,
            mipsPersonId: personId,
            steps
        });

    } catch (error) {
        console.error('[syncMember]', error.message);

        // Mark sync as failed in DB
        try {
            await prisma.member.update({
                where: { id: parseInt(memberId) },
                data: { mipsSyncStatus: 'failed' }
            });
        } catch (_) {}

        return res.status(500).json({
            success: false,
            message: error.message,
            steps
        });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/mips-sync/staff/:userId
// ─────────────────────────────────────────────────────────────
const syncStaff = async (req, res) => {
    const { userId } = req.params;
    const branchId = resolveBranchId(req);
    const steps = [];

    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) }
        });
        if (!user) return res.status(404).json({ success: false, message: 'Staff not found' });

        const personObj = buildStaffObj(user);
        steps.push({ step: 'build', personSn: personObj.personSn });

        const { personId, action } = await upsertPersonInMips(personObj, branchId || user.tenantId);
        steps.push({ step: 'upsert', action, personId });

        // Photo upload
        if (user.avatar) {
            const photoUri = await uploadPhotoToMips(user.avatar, branchId || user.tenantId);
            steps.push({ step: 'photo_upload', photoUri: photoUri ? 'success' : 'skipped' });
            if (photoUri) {
                await assignPhotoToPerson(personObj.personSn, photoUri, branchId || user.tenantId);
                steps.push({ step: 'photo_assign', status: 'done' });
            }
        }

        const syncResult = await syncPersonToDevices(personId, branchId || user.tenantId);
        steps.push({ step: 'device_sync', ...syncResult });

        await prisma.user.update({
            where: { id: user.id },
            data: {
                mipsPersonSn: personObj.personSn,
                mipsPersonId: personId,
                mipsSyncStatus: 'synced',
                mipsSyncedAt: new Date(),
            }
        });

        return res.json({
            success: true,
            message: `Staff "${user.name}" ${action} in MIPS and synced to ${syncResult.deviceCount || 0} device(s)`,
            personSn: personObj.personSn,
            mipsPersonId: personId,
            steps
        });

    } catch (error) {
        console.error('[syncStaff]', error.message);
        try {
            await prisma.user.update({
                where: { id: parseInt(userId) },
                data: { mipsSyncStatus: 'failed' }
            });
        } catch (_) {}

        return res.status(500).json({ success: false, message: error.message, steps });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/mips-sync/revoke/:memberId
// Revoke hardware access — gate blocks immediately
// ─────────────────────────────────────────────────────────────
const revokeMember = async (req, res) => {
    const { memberId } = req.params;
    const branchId = resolveBranchId(req);

    try {
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
        if (!member.mipsPersonSn) {
            return res.status(400).json({
                success: false,
                message: 'Member not synced to MIPS yet. Sync first before revoking.'
            });
        }

        const result = await revokeHardwareAccess(
            member.mipsPersonSn,
            branchId || member.tenantId
        );

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.reason });
        }

        await prisma.member.update({
            where: { id: member.id },
            data: { mipsSyncStatus: 'revoked', mipsSyncedAt: new Date() }
        });

        return res.json({
            success: true,
            message: `Hardware access revoked for "${member.name}". Gate will block immediately.`,
            sync: result.sync
        });

    } catch (error) {
        console.error('[revokeMember]', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/mips-sync/restore/:memberId
// Restore hardware access after freeze/revoke
// ─────────────────────────────────────────────────────────────
const restoreMember = async (req, res) => {
    const { memberId } = req.params;
    const branchId = resolveBranchId(req);

    try {
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
        if (!member.mipsPersonSn) {
            return res.status(400).json({
                success: false,
                message: 'Member not synced to MIPS yet. Sync first.'
            });
        }

        const result = await restoreHardwareAccess(
            member.mipsPersonSn,
            member.expiryDate,
            branchId || member.tenantId
        );

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.reason });
        }

        await prisma.member.update({
            where: { id: member.id },
            data: { mipsSyncStatus: 'synced', mipsSyncedAt: new Date() }
        });

        return res.json({
            success: true,
            message: `Hardware access restored for "${member.name}" until ${result.validTimeEnd}`,
            sync: result.sync
        });

    } catch (error) {
        console.error('[restoreMember]', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/v1/mips-sync/status/member/:memberId
// GET /api/v1/mips-sync/status/staff/:userId
// ─────────────────────────────────────────────────────────────
const getMemberSyncStatus = async (req, res) => {
    const { memberId } = req.params;
    try {
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) },
            select: { id: true, name: true, memberId: true, mipsPersonSn: true, mipsPersonId: true, mipsSyncStatus: true, mipsSyncedAt: true }
        });
        if (!member) return res.status(404).json({ message: 'Member not found' });
        res.json(member);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getStaffSyncStatus = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: { id: true, name: true, role: true, mipsPersonSn: true, mipsPersonId: true, mipsSyncStatus: true, mipsSyncedAt: true }
        });
        if (!user) return res.status(404).json({ message: 'Staff not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    syncMember,
    syncStaff,
    revokeMember,
    restoreMember,
    getMemberSyncStatus,
    getStaffSyncStatus,
};
