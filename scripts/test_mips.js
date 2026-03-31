const axios = require('axios');

async function testUpdate() {
    const baseUrl = 'http://212.38.94.228:9000';
    const tenantId = '1';
    const personSn = 'MEM17748710532211'; // Aman
    const testPhone = '7770003003';

    try {
        console.log('[Test] Logging in...');
        const loginRes = await axios.post(`${baseUrl}/login`, {
            username: 'admin',
            password: 'admin123',
            code: '',
            uuid: ''
        }, { headers: { 'tenant-id': tenantId } });

        const token = loginRes.data.token;
        if (!token) throw new Error('Login failed');
        console.log('[Test] Login success.');

        const client = axios.create({
            baseURL: baseUrl,
            headers: { Authorization: `Bearer ${token}`, 'tenant-id': tenantId }
        });

        console.log('[Test] Looking up Aman...');
        const lookupRes = await client.get(`/interface/exterior/getPersonList?personSn=${personSn}&pageNum=1&pageSize=1`);
        const aman = (lookupRes.data.rows || []).find(p => p.personSn === personSn);
        if (!aman) throw new Error('Aman not found in MIPS');
        console.log('[Test] Found Aman (personId: ' + aman.personId + ')');

        // IMPORTANT: In some RuoYi systems, you must send 'phonenumber' for both to work
        const updatePayload = {
            ...aman,
            name: 'Aman (Sync Test V2)',
            gender: 'M',
            mobile: testPhone,
            phonenumber: testPhone,
            phoneNumber: testPhone,
            phone: testPhone
        };

        // Filter system fields
        const forbidden = ['createTime', 'updateTime', 'createBy', 'updateBy', 'deptName', 'tenantName', 'havePhoto'];
        forbidden.forEach(k => delete updatePayload[k]);

        console.log('[Test] Sending update payload...');
        const updateRes = await client.post('/interface/exterior/updatePerson', updatePayload);
        console.log('[Test] Update response:', updateRes.data);

        // Verify
        const verifyRes = await client.get(`/interface/exterior/getPersonList?personSn=${personSn}&pageNum=1&pageSize=1`);
        const verified = (verifyRes.data.rows || []).find(p => p.personSn === personSn);
        console.log('[Test] Verification - mobile:', verified?.mobile, 'phonenumber:', verified?.phonenumber);

    } catch (err) {
        console.error('[Test] Error:', (err.response?.data || err.message));
    }
}

testUpdate();
