/**
 * mipsWebhook.controller.js
 *
 * Handles face scan callbacks from MIPS devices.
 *
 * Flow:
 *   Device → MIPS middleware → POST /api/v1/gym-device/webhook → here
 *
 * Steps:
 *   1. Parse MIPS payload
 *   2. Normalize timestamp
 *   3. Find device by deviceKey → get branchId
 *   4. 3-tier person lookup (member / employee / trainer)
 *   5. Route attendance by person type
 *   6. Save access_log with branchId
 *   7. Return MIPS-required response { result:1, code:"000" }
 */

const { PrismaClient } = require('@prisma/client');
const { getMipsClient } = require('../utils/mipsHelper');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// HELPER: Normalize MIPS timestamp to JS Date
// Handles: seconds(10), ms(13), us(16), ns(19), ISO string
// ─────────────────────────────────────────────────────────────
const normalizeScanTime = (raw) => {
    if (!raw) return new Date();

    if (typeof raw === 'string' && isNaN(raw)) {
        return new Date(raw); // ISO string
    }

    const num = parseInt(String(raw));
    const len = String(Math.abs(num)).length;

    if (len <= 10) return new Date(num * 1000);           // seconds
    if (len <= 13) return new Date(num);                  // milliseconds
    if (len <= 16) return new Date(Math.floor(num / 1000)); // microseconds
    return new Date(Math.floor(num / 1_000_000));         // nanoseconds
};

// ─────────────────────────────────────────────────────────────
// HELPER: 3-tier person lookup
// Tier 1: mips_person_sn = personId
// Tier 2: mips_person_id = personId (numeric)
// Tier 3: code normalization (hyphen re-insertion)
// ─────────────────────────────────────────────────────────────
const findPerson = async (personId, branchId) => {
    const branchFilter = branchId ? { tenantId: branchId } : {};

    // ── Tier 1: Member lookup (Branch restricted first) ─────────────────────────────
    let member = await prisma.member.findFirst({
        where: {
            ...branchFilter,
            OR: [
                { mipsPersonSn: personId },
                { mipsPersonId: personId }
            ]
        }
    });

    // Fallback: Global Member lookup
    if (!member && branchId) {
        member = await prisma.member.findFirst({
            where: {
                OR: [
                    { mipsPersonSn: personId },
                    { mipsPersonId: personId }
                ]
            }
        });
    }

    if (!member) {
        // Tier 3: code normalization for members (MAIN00001 → MAIN-00001)
        const withHyphen = personId.replace(/([A-Z]+)(\d+)/, '$1-$2');
        member = await prisma.member.findFirst({
            where: { memberId: withHyphen }
        });
    }

    if (member) return { type: 'MEMBER', id: member.id, userId: member.userId, tenantId: member.tenantId };

    // ── Staff / Employee lookup ───────────────────────────────
    let staffUser = await prisma.user.findFirst({
        where: {
            ...(branchId ? { tenantId: branchId } : {}),
            role: { in: ['STAFF', 'MANAGER', 'BRANCH_ADMIN', 'SUPER_ADMIN'] },
            OR: [
                { mipsPersonSn: personId },
                { mipsPersonId: personId },
                { employeeCode: personId.replace(/^EMP/, 'EMP-') } 
            ]
        }
    });

    // Fallback: Global Staff lookup
    if (!staffUser && branchId) {
        staffUser = await prisma.user.findFirst({
            where: {
                role: { in: ['STAFF', 'MANAGER', 'BRANCH_ADMIN', 'SUPER_ADMIN'] },
                OR: [
                    { mipsPersonSn: personId },
                    { mipsPersonId: personId }
                ]
            }
        });
    }

    if (staffUser) return { type: 'EMPLOYEE', id: staffUser.id, userId: staffUser.id, tenantId: staffUser.tenantId };

    // ── Trainer lookup ────────────────────────────────────────
    let trainer = await prisma.user.findFirst({
        where: {
            ...(branchId ? { tenantId: branchId } : {}),
            role: 'TRAINER',
            OR: [
                { mipsPersonSn: personId },
                { mipsPersonId: personId }
            ]
        }
    });

    // Fallback: Global Trainer lookup
    if (!trainer && branchId) {
        trainer = await prisma.user.findFirst({
            where: {
                role: 'TRAINER',
                OR: [
                    { mipsPersonSn: personId },
                    { mipsPersonId: personId }
                ]
            }
        });
    }

    if (trainer) return { type: 'TRAINER', id: trainer.id, userId: trainer.id, tenantId: trainer.tenantId };

    return null; // unknown person (visitor/stranger)
};

// ─────────────────────────────────────────────────────────────
// HELPER: Process member attendance
// ─────────────────────────────────────────────────────────────
const processMemberAttendance = async (memberId, branchId, scanTime) => {
    const today = new Date(scanTime);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await prisma.attendance.findFirst({
        where: {
            memberId,
            type: 'member',
            checkIn: { gte: today, lt: tomorrow }
        }
    });

    if (existing && !existing.checkOut) {
        await prisma.attendance.update({
            where: { id: existing.id },
            data: { checkOut: scanTime, checkOutMethod: 'biometric' }
        });
        return 'CHECK_OUT';
    } else if (!existing) {
        // Validate membership via Member.expiryDate + status
        const member = await prisma.member.findFirst({
            where: { id: memberId, status: 'Active', expiryDate: { gte: scanTime } }
        });

        await prisma.attendance.create({
            data: {
                memberId,
                tenantId: branchId || 1,
                type: 'member',
                checkIn: scanTime,
                checkInMethod: 'biometric',
                status: member ? 'Present' : 'Denied'
            }
        });
        return member ? 'CHECK_IN' : 'CHECK_IN_DENIED';
    }

    return 'ALREADY_CHECKED_IN';
};

// ─────────────────────────────────────────────────────────────
// HELPER: Toggle staff/trainer attendance
// Uses shared Attendance model with type:'staff'
// ─────────────────────────────────────────────────────────────
const processStaffAttendance = async (userId, branchId, scanTime) => {
    const today = new Date(scanTime);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await prisma.attendance.findFirst({
        where: {
            userId,
            type: 'staff',
            checkIn: { gte: today, lt: tomorrow },
            checkOut: null
        }
    });

    if (existing) {
        await prisma.attendance.update({
            where: { id: existing.id },
            data: { checkOut: scanTime, checkOutMethod: 'biometric' }
        });
        return 'CHECK_OUT';
    } else {
        await prisma.attendance.create({
            data: {
                userId,
                tenantId: branchId || 1,
                type: 'staff',
                checkIn: scanTime,
                checkInMethod: 'biometric',
                status: 'Present'
            }
        });
        return 'CHECK_IN';
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/v1/gym-device/webhook
// Main webhook handler — no auth middleware (device callback)
// ─────────────────────────────────────────────────────────────
const handleMipsWebhook = async (req, res) => {
    // Always respond immediately with MIPS-required format
    res.json({ result: 1, code: '000' });

    try {
        const payload = req.body;
        console.log('[MipsWebhook] Received payload:', JSON.stringify(payload).slice(0, 300));

        const { personId, personName, type: passType, time, deviceKey, deviceName, checkImgUri, picUrl } = payload;
        const imageUrl = checkImgUri || picUrl || null;

        // ── Step 1: Normalize timestamp ───────────────────────
        const scanTime = normalizeScanTime(time);

        // ── Step 2: Find device → get branchId ───────────────
        let branchId = null;
        if (deviceKey) {
            const device = await prisma.device.findFirst({ where: { deviceKey } });
            if (device) {
                branchId = device.branchId;
                console.log(`[MipsWebhook] Device found: ${device.name}, branchId: ${branchId}`);
            } else {
                console.warn(`[MipsWebhook] Unknown deviceKey: ${deviceKey}`);
            }
        }

        // ── Step 3: Skip non-authorized scans ─────────────────
        if (passType === 'face_2') {
            console.log('[MipsWebhook] Stranger/unrecognized — skipping attendance');
            // Still log the access attempt
            await prisma.accessLog.create({
                data: {
                    personId: personId || 'UNKNOWN',
                    personName: personName || 'Stranger',
                    deviceKey: deviceKey || null,
                    deviceName: deviceName || null,
                    passType: passType || 'face_2',
                    scanTime,
                    branchId,
                    imageUrl,
                    status: 'DENIED_STRANGER'
                }
            }).catch(e => console.error('[MipsWebhook] AccessLog insert failed:', e.message));
            return;
        }

        // ── Step 4: 3-tier person lookup ──────────────────────
        const person = await findPerson(personId, branchId);

        let attendanceResult = 'UNKNOWN';

        if (!person) {
            console.log(`[MipsWebhook] Person not found (External Gym User?): ${personName} (${personId}). Skipping record.`);
            return; // EXIT HERE: We don't record scans for people not in our system
        }

        // ── Step 5: Route attendance by type ─────────────
        if (person.type === 'MEMBER') {
            attendanceResult = await processMemberAttendance(person.id, branchId, scanTime);
        } else if (person.type === 'EMPLOYEE' || person.type === 'TRAINER') {
            attendanceResult = await processStaffAttendance(person.userId, branchId, scanTime);
        }

        // ── Step 6: Save access log with branchId ─────────────
        await prisma.accessLog.create({
            data: {
                personId: personId || 'UNKNOWN',
                personName: personName || 'Unknown',
                deviceKey: deviceKey || null,
                deviceName: deviceName || null,
                passType: passType || 'face_0',
                scanTime,
                branchId,
                imageUrl,
                personTenantId: person?.tenantId || null,
                personType: person?.type || 'VISITOR',
                attendanceResult,
                status: attendanceResult.includes('DENIED') ? 'DENIED' : 'ALLOWED'
            }
        }).catch(e => console.error('[MipsWebhook] AccessLog insert failed:', e.message));

        console.log(`[MipsWebhook] Processed: ${personName} (${person?.type || 'VISITOR'}) → ${attendanceResult} @ branch ${branchId}`);

        // ── Relay back to MIPS (optional) ─────────────────────
        if (branchId && deviceKey) {
            getMipsClient(branchId)
                .then(client => client.post('/api/callback/identify', payload))
                .catch(e => console.warn('[MipsWebhook] MIPS relay failed:', e.message));
        }

    } catch (error) {
        console.error('[MipsWebhook] Processing error:', error.message);
    }
};

module.exports = { handleMipsWebhook };
