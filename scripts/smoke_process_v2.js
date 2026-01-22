const axios = require('axios');
const FormData = require('form-data');
const { getAuthHeaders } = require('./smoke_utils');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('--- SMOKE TEST: PROCESS V2 API ---');
    try {
        const headers = await getAuthHeaders();
        const project = 'default';

        console.log('1. Testing POST /api/extract (Upload)...');
        // Create a dummy PDF file for testing
        const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
        fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n%EOF');

        const form = new FormData();
        form.append('files', fs.createReadStream(dummyPdfPath));

        // Headers for form data need to be merged with auth
        const formHeaders = form.getHeaders();
        const uploadRes = await axios.post(`http://localhost:3000/api/extract?project=${project}`, form, {
            headers: { ...headers, ...formHeaders }
        });

        console.log(`   Status: ${uploadRes.status}`);
        if (uploadRes.status !== 200) throw new Error('Upload failed');
        if (!uploadRes.data.batchId) throw new Error('No batchId returned');

        const batchId = uploadRes.data.batchId;
        console.log(`   Success! Batch ID: ${batchId}`);

        // cleanup dummy
        fs.unlinkSync(dummyPdfPath);

        console.log('2. Testing GET /api/progress/:batchId...');
        const progRes = await axios.get(`http://localhost:3000/api/progress/${batchId}?project=${project}`, { headers });
        console.log(`   Status: ${progRes.status}`);
        if (progRes.status !== 200) throw new Error('Progress failed');
        if (typeof progRes.data.done !== 'number') throw new Error('Invalid progress data structure');
        console.log(`   Success! Done: ${progRes.data.done}/${progRes.data.total}`);

        console.log('3. Testing GET /api/batch/:batchId...');
        const batchRes = await axios.get(`http://localhost:3000/api/batch/${batchId}?project=${project}`, { headers });
        console.log(`   Status: ${batchRes.status}`);
        if (batchRes.status !== 200) throw new Error('Batch Fetch failed');
        if (!Array.isArray(batchRes.data.rows)) throw new Error('Invalid batch rows structure');
        console.log(`   Success! Rows: ${batchRes.data.rows.length}`);

        console.log('✅ SMOKE TEST PASSED');

    } catch (e) {
        console.error('❌ SMOKE TEST FAILED');
        if (e.response) {
            console.error(`   Status: ${e.response.status}`);
            console.error(`   Data: ${JSON.stringify(e.response.data)}`);
            console.error(`   Url: ${e.config.url}`);
        } else {
            console.error(`   Error: ${e.message}`);
        }
        process.exit(1);
    }
})();
