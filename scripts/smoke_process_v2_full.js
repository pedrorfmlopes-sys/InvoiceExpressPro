const axios = require('axios');
const FormData = require('form-data');
const { getAuthHeaders } = require('./smoke_utils');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

(async () => {
    console.log('\n--- FULL LIFECYCLE SMOKE TEST: PROCESS V2 MODULE ---\n');
    let dummy1 = path.join(__dirname, 'test_doc_1.pdf');
    let dummy2 = path.join(__dirname, 'test_doc_2.pdf');
    let headers = {};
    let project = 'default';

    try {
        console.log('[1/7] Authenticating...');
        headers = await getAuthHeaders();
        const realPdfPath = path.join(process.cwd(), 'uploads', 'v2-1765665047539-328029762-284b.pdf');
        if (!fs.existsSync(realPdfPath)) throw new Error('Real PDF not found for testing: ' + realPdfPath);

        fs.copyFileSync(realPdfPath, dummy1);
        fs.copyFileSync(realPdfPath, dummy2);

        const form = new FormData();
        form.append('files', fs.createReadStream(dummy1));
        form.append('files', fs.createReadStream(dummy2));

        const uploadRes = await axios.post(`${BASE_URL}/api/extract?project=${project}`, form, {
            headers: { ...headers, ...form.getHeaders() }
        });

        if (uploadRes.status !== 200) throw new Error(`Upload returned ${uploadRes.status}`);
        const batchId = uploadRes.data.batchId;
        console.log(`   ✅ Upload OK (Batch: ${batchId})`);

        console.log('[3/7] Polling for completion...');
        let isDone = false;
        let pData = {};
        for (let i = 0; i < 10; i++) {
            const pRes = await axios.get(`${BASE_URL}/api/progress/${batchId}?project=${project}`, { headers });
            if (pRes.status !== 200) throw new Error(`Progress returned ${pRes.status}`);
            pData = pRes.data;
            if ((pData.done + pData.errors) >= pData.total) {
                isDone = true;
                break;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (!isDone) throw new Error('Timeout waiting for processing');
        console.log(`   ✅ Processing Finished (${pData.done} done, ${pData.errors} errors)`);

        console.log('[4/7] Fetching Batch Rows...');
        const bRes = await axios.get(`${BASE_URL}/api/batch/${batchId}?project=${project}`, { headers });
        if (bRes.status !== 200) throw new Error(`Batch fetch returned ${bRes.status}`);
        const rows = bRes.data.rows;
        if (rows.length !== 2) throw new Error(`Expected 2 rows, got ${rows.length}`);
        console.log('   ✅ Rows fetched OK');

        const row1 = rows[0];
        const row2 = rows[1];

        console.log('[5/7] Testing EDIT (PATCH) on Row 1...');
        const patchRes = await axios.patch(`${BASE_URL}/api/doc/${row1.id}?project=${project}`, {
            docType: 'Fatura',
            docNumber: `TEST-FULL-${Date.now()}`,
            total: 123.45
        }, { headers });
        if (patchRes.status !== 200) throw new Error(`Patch returned ${patchRes.status}`);
        console.log('   ✅ Edit Row 1 OK');

        console.log('[6/7] Testing DELETE on Row 2...');
        const delRes = await axios.delete(`${BASE_URL}/api/doc/${row2.id}?project=${project}`, { headers });
        if (delRes.status !== 200) throw new Error(`Delete returned ${delRes.status}`);

        // Verify delete by attempting to modify it again (should fail)
        try {
            await axios.patch(`${BASE_URL}/api/doc/${row2.id}?project=${project}`, { total: 0 }, { headers });
            throw new Error('Row 2 still exists (PATCH succeeded after DELETE)');
        } catch (e) {
            const status = e.response ? e.response.status : 0;
            const data = e.response ? e.response.data : {};

            if (status === 404 || (status === 500 && (data.error || '').includes('not found'))) {
                console.log('   ✅ Delete Row 2 OK (Confirmed via failure on subsequent patch)');
            } else {
                throw e; // Rethrow if unexpected error
            }
        }

        console.log('[7/7] Testing FINALIZE-BULK on Row 1...');
        const finalRes = await axios.post(`${BASE_URL}/api/docs/finalize-bulk?project=${project}`, {
            items: [{ id: row1.id }]
        }, { headers });

        if (finalRes.status !== 200) throw new Error(`Finalize returned ${finalRes.status}`);
        // Check results inside
        const results = finalRes.data.results || [];
        const res1 = results.find(r => r.id === row1.id);
        if (!res1 || !res1.ok) throw new Error(`Finalize result failed for Row 1: ${JSON.stringify(res1)}`);

        console.log('   ✅ Finalize OK');

        console.log('\n✅✅ ALL TESTS PASSED (Status 200 verified) ✅✅');

    } catch (e) {
        console.error('\n❌ TEST FAILED');
        if (e.response) {
            console.error(`   HTTP ${e.response.status} - ${e.config.method.toUpperCase()} ${e.config.url}`);
            console.error(`   Data:`, e.response.data);
        } else {
            console.error(`   Error: ${e.message}`);
        }
        process.exit(1);
    } finally {
        if (fs.existsSync(dummy1)) fs.unlinkSync(dummy1);
        if (fs.existsSync(dummy2)) fs.unlinkSync(dummy2);
    }
})();
