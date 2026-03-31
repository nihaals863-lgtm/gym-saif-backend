const express = require('express');
const router = express.Router();
const { 
    generatePayroll, 
    getPayrollHistory, 
    updatePayrollStatus, 
    generatePayslip,
    deletePayroll
} = require('../controllers/payrollController');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/generate', generatePayroll);
router.get('/history', getPayrollHistory);
router.put('/:id', updatePayrollStatus);
router.delete('/:id', deletePayroll);
router.get('/:id/payslip', generatePayslip);

module.exports = router;
