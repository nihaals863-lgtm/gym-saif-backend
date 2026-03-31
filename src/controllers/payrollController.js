const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper to calculate duration in minutes
const calculateDurationInMinutes = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
    const inTime = new Date(checkIn);
    const outTime = new Date(checkOut);
    const diffMs = outTime - inTime;
    return diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
};

// Generate Payroll for a specific branch and month
const generatePayroll = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        let { year, month, staffIds } = req.body;

        if (!year || !month) {
            return res.status(400).json({ error: 'Year and month are required' });
        }

        year = parseInt(year);
        month = parseInt(month);

        // 1. Fetch staff for the branch — filter by provided staffIds if given
        const staffWhereClause = {
            tenantId,
            role: { in: ['STAFF', 'TRAINER', 'MANAGER', 'BRANCH_ADMIN'] },
            status: 'Active'
        };

        if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
            staffWhereClause.id = { in: staffIds.map(Number) };
        }

        const staffList = await prisma.user.findMany({ where: staffWhereClause });

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        const daysInMonth = endDate.getDate();

        const payrollResults = [];

        for (const staff of staffList) {
            // 2. Fetch attendance for the month
            const attendanceRecords = await prisma.attendance.findMany({
                where: {
                    userId: staff.id,
                    tenantId,
                    type: 'Staff',
                    date: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            });

            // Consider a valid attendance day if checkOut exists and duration > 0 (or just present count)
            const attendanceDays = attendanceRecords.filter(a => a.status === 'Present' || a.status === 'checked-out' || a.status === 'checked-in').length;

            // 3. Fetch approved leaves for the month
            const leaves = await prisma.leaveRequest.findMany({
                where: {
                    userId: staff.id,
                    tenantId,
                    status: 'Approved',
                    startDate: { gte: startDate },
                    endDate: { lte: endDate }
                }
            });

            let leaveDays = 0;
            leaves.forEach(leave => {
                const diffTime = Math.abs(new Date(leave.endDate) - new Date(leave.startDate));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                leaveDays += diffDays;
            });

            // 4. Calculate Net Pay
            const baseSalary = staff.baseSalary ? parseFloat(staff.baseSalary) : 0;
            const dailySalary = baseSalary / daysInMonth;
            
            // Fetch Distributed PT Commissions for this month/year
            const ptCommissions = await prisma.commission.findMany({
                where: {
                    trainerId: staff.id,
                    tenantId,
                    month,
                    year,
                    status: 'Pending'
                }
            });

            const ptCommissionSum = ptCommissions.reduce((acc, comm) => acc + parseFloat(comm.amount), 0);

            // Total Commission = PT Distributed items sum only (Rounded to nearest integer as requested)
            const commissionAmount = Math.round(ptCommissionSum);

            const leaveDeduction = isNaN(leaveDays * dailySalary) ? 0 : (leaveDays * dailySalary);
            
            const netPay = (baseSalary + commissionAmount) - leaveDeduction;
            const finalAmount = isNaN(netPay) ? 0 : (netPay > 0 ? netPay : 0);

            // Fetch existing record to avoid duplicate entries for same month/year
            const existingRecord = await prisma.payroll.findFirst({
                where: {
                    staffId: staff.id,
                    tenantId,
                    month,
                    year
                }
            });

            let result;
            if (existingRecord) {
                result = await prisma.payroll.update({
                    where: { id: existingRecord.id },
                    data: {
                        baseSalary,
                        attendanceDays,
                        leaveDays: isNaN(leaveDays) ? 0 : leaveDays,
                        commission: isNaN(commissionAmount) ? 0 : commissionAmount,
                        leaveDeduction,
                        amount: finalAmount,
                        status: 'Approved'
                    }
                });
            } else {
                result = await prisma.payroll.create({
                    data: {
                        tenantId,
                        staffId: staff.id,
                        baseSalary,
                        attendanceDays,
                        leaveDays: isNaN(leaveDays) ? 0 : leaveDays,
                        commission: isNaN(commissionAmount) ? 0 : commissionAmount,
                        leaveDeduction,
                        extra_bonus: 0,
                        amount: finalAmount,
                        year,
                        month,
                        status: 'Approved'
                    }
                });
            }

            payrollResults.push(result);
        }

        res.json({ message: 'Payroll generated successfully', payroll: payrollResults });

    } catch (error) {
        console.error('Error generating payroll:', error);
        res.status(500).json({ error: 'Failed to generate payroll' });
    }
};

const getPayrollHistory = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const payrolls = await prisma.payroll.findMany({
            where: { tenantId },
            include: { staff: { select: { id: true, name: true, email: true, role: true, department: true } } },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });
        res.json(payrolls);
    } catch (error) {
        console.error('Error fetching payroll history:', error);
        res.status(500).json({ error: 'Failed to fetch payroll history' });
    }
};

const updatePayrollStatus = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;
        const { status, commission, extra_bonus, rejectionReason } = req.body; // Allow manual overrides

        const payrollRecord = await prisma.payroll.findUnique({ where: { id: Number(id) } });
        if (!payrollRecord || payrollRecord.tenantId !== tenantId) {
            return res.status(404).json({ error: 'Payroll not found' });
        }

        let updateData = { status };

        if (rejectionReason !== undefined) {
            updateData.rejectionReason = rejectionReason;
        }

        if (status === 'Approved') {
            updateData.rejectionReason = null; // Clear rejection reason when re-approving
        }

        if (commission !== undefined || extra_bonus !== undefined) {
             const newCommission = commission !== undefined ? parseFloat(commission) : parseFloat(payrollRecord.commission);
             const bonus = extra_bonus !== undefined ? parseFloat(extra_bonus) : 0;
             const baseSalary = parseFloat(payrollRecord.baseSalary);
             const leaveDeduction = parseFloat(payrollRecord.leaveDeduction);
             
             const netPay = (baseSalary + newCommission + bonus) - leaveDeduction;
             updateData.commission = newCommission + bonus;
             updateData.amount = netPay > 0 ? netPay : 0;
        }

        const updatedPayroll = await prisma.payroll.update({
            where: { id: Number(id) },
            data: updateData
        });

        res.json(updatedPayroll);

    } catch (error) {
        console.error('Error updating payroll status:', error);
        res.status(500).json({ error: 'Failed to update payroll status' });
    }
};

const generatePayslip = async (req, res) => {
    try {
         const { id } = req.params;
         const tenantId = req.user.tenantId;

         const payroll = await prisma.payroll.findUnique({
             where: { id: Number(id) },
             include: { 
                 staff: true,
                 tenant: true
             }
         });

         if (!payroll || payroll.tenantId !== tenantId) {
             return res.status(404).json({ error: 'Payroll not found' });
         }

         if (payroll.status !== 'Paid' && payroll.status !== 'Processed') {
             return res.status(400).json({ error: 'Payslip can only be generated for paid salaries' });
         }

         // Generate PDF
         const doc = new PDFDocument({ margin: 50 });
         let filename = `Payslip_${payroll.staff.name.replace(/\s+/g, '_')}_${payroll.month}_${payroll.year}.pdf`;
         res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
         res.setHeader('Content-type', 'application/pdf');

         doc.pipe(res);

         // Header
         doc.fontSize(20).bold().text(payroll.tenant.name, { align: 'center' });
         doc.fontSize(10).text(payroll.tenant.location || 'Branch Office', { align: 'center' });
         doc.moveDown();
         
         // Title
         doc.fontSize(16).text('PAYSLIP', { align: 'center', underline: true });
         doc.moveDown();

         // Employee Details
         doc.fontSize(12).text(`Employee Name: ${payroll.staff.name}`);
         doc.text(`Employee ID: EMP-${String(payroll.staff.id).padStart(3, '0')}`);
         doc.text(`Position: ${payroll.staff.role}`);
         doc.text(`Period: ${new Date(payroll.year, payroll.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`);
         doc.moveDown();

         // Salary Breakdown Table Headers
         const startX = 50;
         let currentY = doc.y;
         
         doc.moveTo(startX, currentY).lineTo(550, currentY).stroke();
         currentY += 10;
         doc.font('Helvetica-Bold').text('Description', startX, currentY);
         doc.text('Amount (INR)', 400, currentY, { width: 150, align: 'right' });
         currentY += 20;
         doc.moveTo(startX, currentY).lineTo(550, currentY).stroke();
         currentY += 10;

         // Rows
         doc.font('Helvetica');
         doc.text('Base Salary', startX, currentY);
         doc.text(`${parseFloat(payroll.baseSalary).toFixed(2)}`, 400, currentY, { width: 150, align: 'right' });
         currentY += 20;

         doc.text(`Commission / Bonus`, startX, currentY);
         doc.text(`${parseFloat(payroll.commission).toFixed(2)}`, 400, currentY, { width: 150, align: 'right' });
         currentY += 20;

         doc.text(`Leave Deductions (${payroll.leaveDays} days)`, startX, currentY);
         doc.text(`- ${parseFloat(payroll.leaveDeduction).toFixed(2)}`, 400, currentY, { width: 150, align: 'right' });
         currentY += 20;
         
         doc.moveTo(startX, currentY).lineTo(550, currentY).stroke();
         currentY += 10;

         // Total
         doc.font('Helvetica-Bold');
         doc.text('Net Payable', startX, currentY);
         doc.text(`${parseFloat(payroll.amount).toFixed(2)}`, 400, currentY, { width: 150, align: 'right' });
         
         currentY += 50;
         doc.font('Helvetica').fontSize(10).text('This is a computer-generated document. No signature is required.', startX, currentY, { align: 'center' });

         doc.end();

    } catch (error) {
        console.error('Error generating payslip:', error);
        res.status(500).json({ error: 'Failed to generate payslip' });
    }
};

const deletePayroll = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        const payrollRecord = await prisma.payroll.findUnique({ where: { id: Number(id) } });
        if (!payrollRecord || payrollRecord.tenantId !== tenantId) {
            return res.status(404).json({ error: 'Payroll not found' });
        }

        if (payrollRecord.status === 'Paid') {
            return res.status(400).json({ error: 'Cannot delete a payroll that has already been Paid' });
        }

        await prisma.payroll.delete({ where: { id: Number(id) } });
        res.json({ message: 'Payroll deleted successfully' });

    } catch (error) {
        console.error('Error deleting payroll:', error);
        res.status(500).json({ error: 'Failed to delete payroll' });
    }
};

module.exports = {
    generatePayroll,
    getPayrollHistory,
    updatePayrollStatus,
    generatePayslip,
    deletePayroll
};
