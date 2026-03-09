const fs = require('fs');
const path = 'c:/Users/asus/OneDrive/Documents/gym_lovable/gymB/src/controllers/branchAdmin.controller.js';
let code = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// Add helper at the top
const helper = `
const getWhereClause = (req, prefix = '') => {
    const { tenantId, role } = req.user;
    const { branchId } = req.query;

    if (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' || role === 'MANAGER') {
        if (branchId && branchId !== 'all' && branchId !== 'undefined' && branchId !== 'null') {
            return prefix ? { [prefix]: { tenantId: parseInt(branchId) } } : { tenantId: parseInt(branchId) };
        } else if (branchId === 'all') {
            return {};
        }
    }
    
    return role === 'SUPER_ADMIN' ? {} : (prefix ? { [prefix]: { tenantId } } : { tenantId });
};

`;

if (!code.includes('getWhereClause')) {
    code = code.replace("const prisma = require('../config/prisma');\n", "const prisma = require('../config/prisma');\n" + helper);
}

// 1. getDashboardStats
code = code.replace(
    /const \{ tenantId, role \} = req\.user;\n\n\s*if \(!tenantId && role !== 'SUPER_ADMIN'\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}\n\n\s*const whereClause = role === 'SUPER_ADMIN' \? \{\} : \{ tenantId \};/g,
    `const { role } = req.user;\n        const whereClause = getWhereClause(req);`
);

// 2. getRecentActivities
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\n\s*\/\/ Fetch recent check-ins\n\s*const recentCheckIns = await prisma\.attendance\.findMany\(\{\n\s*where: \{ user: \{ tenantId \} \},/g,
    `const whereClause = getWhereClause(req, 'user');\n\n        // Fetch recent check-ins\n        const recentCheckIns = await prisma.attendance.findMany({\n            where: whereClause,`
);

// 3. getTrainerAvailability
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\n\s*const trainers = await prisma\.user\.findMany\(\{\n\s*where: \{ tenantId, role: 'TRAINER' \},/g,
    `const whereClause = getWhereClause(req);\n\n        const trainers = await prisma.user.findMany({\n            where: { ...whereClause, role: 'TRAINER' },`
);

// 4. getFinancialStats
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\n\s*const startOfDay = new Date\(\);\n\s*startOfDay\.setHours\(0, 0, 0, 0\);\n\n\s*\/\/ 1\. Fetch Invoices for Today \(Paid only\)\n\s*const invoices = await prisma\.invoice\.findMany\(\{\n\s*where: \{\n\s*tenantId,\n\s*status: 'Paid',/g,
    `const whereClause = getWhereClause(req);\n\n        const startOfDay = new Date();\n        startOfDay.setHours(0, 0, 0, 0);\n\n        // 1. Fetch Invoices for Today (Paid only)\n        const invoices = await prisma.invoice.findMany({\n            where: {\n                ...whereClause,\n                status: 'Paid',`
);
code = code.replace(
    /const expenses = await prisma\.expense\.aggregate\(\{\n\s*where: \{\n\s*tenantId,\n\s*date: \{ gte: startOfDay \}\n\s*\},/g,
    `const expenses = await prisma.expense.aggregate({\n            where: {\n                ...whereClause,\n                date: { gte: startOfDay }\n            },`
);

// 5. getRevenueReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ date \} = req\.query; \/\/ format 'YYYY-MM-DD'\n\n\s*if \(!tenantId\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}/g,
    `const { date } = req.query;\n        const whereClause = getWhereClause(req);`
);
code = code.replace(
    /where: \{\n\s*tenantId,\n\s*status: 'Paid',/g,
    `where: {\n                ...whereClause,\n                status: 'Paid',`
);
code = code.replace(
    /where: \{\n\s*tenantId,\n\s*status: \{ in: \['Unpaid', 'Partial'\] \},/g,
    `where: {\n                ...whereClause,\n                status: { in: ['Unpaid', 'Partial'] },`
);
code = code.replace(
    /const transactions = await prisma\.invoice\.findMany\(\{\n\s*where: \{ tenantId \},/g,
    `const transactions = await prisma.invoice.findMany({\n            where: whereClause,`
);

// 6. getMembershipReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ date \} = req\.query; \/\/ format 'YYYY-MM-DD'\n\n\s*if \(!tenantId\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}/g,
    `const { date } = req.query;\n        const whereClause = getWhereClause(req);`
);
code = code.replace(/where: \{\n\s*tenantId,\n\s*status: 'Active'/g, `where: {\n                ...whereClause,\n                status: 'Active'`);
code = code.replace(/where: \{\n\s*tenantId,\n\s*joinDate:/g, `where: {\n                ...whereClause,\n                joinDate:`);
code = code.replace(/where: \{\n\s*tenantId,\n\s*status: 'Expired',/g, `where: {\n                ...whereClause,\n                status: 'Expired',`);
code = code.replace(/const members = await prisma\.member\.findMany\(\{\n\s*where: \{ tenantId \},/g, `const members = await prisma.member.findMany({\n            where: whereClause,`);

// 7. getLeadConversionReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ date \} = req\.query;\n\n\s*if \(!tenantId\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}/g,
    `const { date } = req.query;\n        const whereClause = getWhereClause(req);`
);
code = code.replace(/where: \{ tenantId, createdAt:/g, `where: { ...whereClause, createdAt:`);
code = code.replace(/where: \{ tenantId, status: 'Converted'/g, `where: { ...whereClause, status: 'Converted'`);
code = code.replace(/const leads = await prisma\.lead\.findMany\(\{\n\s*where: \{ tenantId \},/g, `const leads = await prisma.lead.findMany({\n            where: whereClause,`);

// 8. getExpenseReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ date \} = req\.query; \/\/ format 'YYYY-MM-DD'\n\n\s*if \(!tenantId\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}/g,
    `const { date } = req.query;\n        const whereClause = getWhereClause(req);`
);
code = code.replace(/where: \{\n\s*tenantId,\n\s*date/g, `where: {\n                ...whereClause,\n                date`);
code = code.replace(/const expenses = await prisma\.expense\.findMany\(\{\n\s*where: \{ tenantId \},/g, `const expenses = await prisma.expense.findMany({\n            where: whereClause,`);

// 9. getPerformanceReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\n\s*if \(!tenantId && req\.user\.role !== 'SUPER_ADMIN'\) \{\n\s*return res\.status\(400\)\.json\(\{ message: 'Tenant ID not found for user' \}\);\n\s*\}\n\n\s*const whereClause = req\.user\.role === 'SUPER_ADMIN' \? \{\} : \{ tenantId \};/g,
    `const whereClause = getWhereClause(req);`
);

// 10. getAttendanceReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ date, type, search, page = 1, limit = 10 \} = req\.query;/g,
    `const { date, type, search, page = 1, limit = 10 } = req.query;\n        const whereClause = getWhereClause(req);`
);
code = code.replace(
    /const where = \{\n\s*tenantId,\n\s*date/g,
    `const where = {\n            ...whereClause,\n            date`
);
code = code.replace(/where: \{ tenantId, date:/g, `where: { ...whereClause, date:`);
code = code.replace(/where: \{ tenantId, user:/g, `where: { ...whereClause, user:`);

// 11. getBookingReport
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const \{ search, status, dateRange, page = 1, limit = 10 \} = req\.query;\n\n\s*\/\/ Build AND conditions\n\s*const andConditions = \[\n\s*\{ member: \{ tenantId \} \}\n\s*\];/g,
    `const { search, status, dateRange, page = 1, limit = 10 } = req.query;\n        const whereClause = getWhereClause(req, 'member');\n\n        // Build AND conditions\n        const andConditions = [\n            whereClause\n        ];`
);
code = code.replace(/where: \{ member: \{ tenantId \} \}/g, `where: whereClause`);
code = code.replace(/where: \{ AND: \[\{ member: \{ tenantId \} \}/g, `where: { AND: [whereClause`);

// 12. getLiveAccess
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const startOfDay = new Date\(\); startOfDay\.setHours\(0, 0, 0, 0\);\n\s*const endOfDay = new Date\(\); endOfDay\.setHours\(23, 59, 59, 999\);\n\n\s*\/\/ Fetch today's attendance records for this tenant\n\s*const records = await prisma\.attendance\.findMany\(\{\n\s*where: \{ tenantId, date:/g,
    `const whereClause = getWhereClause(req);\n        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);\n        const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);\n\n        // Fetch today's attendance records for this tenant\n        const records = await prisma.attendance.findMany({\n            where: { ...whereClause, date:`
);
code = code.replace(/where: \{ userId: r\.userId, tenantId \},/g, `where: { userId: r.userId, ...whereClause },`);

// 13. getRenewalAlerts
code = code.replace(
    /const tenantId = req\.user\.tenantId;\n\s*const today = new Date\(\);\n\s*today\.setHours\(0, 0, 0, 0\);\n\n\s*const in7Days = new Date\(today\);\n\s*in7Days\.setDate\(today\.getDate\(\) \+ 7\);\n\n\s*const expiringSoon = await prisma\.member\.findMany\(\{\n\s*where: \{\n\s*tenantId,/g,
    `const whereClause = getWhereClause(req);\n        const today = new Date();\n        today.setHours(0, 0, 0, 0);\n\n        const in7Days = new Date(today);\n        in7Days.setDate(today.getDate() + 7);\n\n        const expiringSoon = await prisma.member.findMany({\n            where: {\n                ...whereClause,`
);
code = code.replace(/where: \{\n\s*tenantId,\n\s*status: 'Expired',/g, `where: {\n                ...whereClause,\n                status: 'Expired',`);


fs.writeFileSync(path, code);
console.log('Regex matched tests?');
