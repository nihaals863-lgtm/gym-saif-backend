const express = require('express');
const {
    getExpenses,
    createExpense,
    getInvoices,
    receivePayment,
    getTransactions,
    deleteExpense,
    getFinanceStats,
    createInvoice,
    getInvoiceById,
    deleteInvoice,
    getExpenseCategories,
    createExpenseCategory,
    deleteExpenseCategory,
    settleInvoice
} = require('../controllers/finance.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/stats', getFinanceStats);
router.get('/expenses', getExpenses);
router.post('/expenses', createExpense);
router.delete('/expenses/:id', deleteExpense);

router.get('/expense-categories', getExpenseCategories);
router.post('/expense-categories', createExpenseCategory);
router.delete('/expense-categories/:id', deleteExpenseCategory);

router.get('/invoices', getInvoices);
router.get('/invoices/:id', getInvoiceById);
router.post('/invoices', createInvoice);
router.delete('/invoices/:id', deleteInvoice);
router.patch('/invoices/:id/settle', settleInvoice);
router.post('/cashier', receivePayment);
router.get('/transactions', getTransactions);

module.exports = router;
