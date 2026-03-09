const jwt = require('jsonwebtoken');

async function testFetch() {
    // Mock user for tenant 5 as BRANCH_ADMIN, assuming ID 1.
    const token = jwt.sign({ id: 1, role: 'BRANCH_ADMIN', tenantId: 5 }, 'super_secret_jwt_key_123!', { expiresIn: '1h' });
    try {
        const response = await fetch('http://localhost:8000/api/v1/finance/invoices', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
testFetch();
