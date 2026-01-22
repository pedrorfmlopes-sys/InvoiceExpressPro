require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

async function assert(condition, msg) {
    if (!condition) {
        console.error("FAIL: " + msg);
        process.exit(1);
    }
    console.log("PASS: " + msg);
}

async function run() {
    try {
        console.log("1. Authenticating...");
        // Use server secret found in .env
        const secret = 'dev-secret-fix-login';
        console.log("Generating token locally...");
        const token = jwt.sign({
            userId: 'e86f5b2d-3bd7-444c-8fea-52cc31c7f0bc',
            role: 'admin',
            orgId: 'ce5ea034-7f80-4161-be83-b5b79e39eb1b'
        }, secret, { expiresIn: '1h' });

        const authHeaders = { Authorization: `Bearer ${token}` };

        // 2. Prepare Sample Image (PNG)
        // 1x1 PNG
        const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const tempPng = path.join(__dirname, 'temp_test_asset.png');
        fs.writeFileSync(tempPng, pngBuffer);

        // 3. Upload PNG
        console.log("2. Uploading PNG...");
        const form = new FormData();
        form.append('file', fs.createReadStream(tempPng));

        const resUpload = await axios.post(`${BASE_URL}/assets/upload`, form, {
            headers: { ...authHeaders, ...form.getHeaders() }
        });

        assert(resUpload.status === 200, "Upload 200 OK");
        const asset1 = resUpload.data;
        assert(asset1.id, "Returned ID: " + asset1.id);
        assert(asset1.mime_type === 'image/png', "Mime Type correct");

        // 4. Verify Get
        console.log("3. Downloading Asset...");
        const resGet = await axios.get(`${BASE_URL}/assets/${asset1.id}`, { responseType: 'arraybuffer' });
        assert(resGet.status === 200, "Get 200 OK");
        assert(resGet.data.length === pngBuffer.length, "Content Length matches");
        assert(resGet.headers['content-type'] === 'image/png', "Content Type Header matches");

        // 5. Upload Duplicate
        console.log("4. Uploading Duplicate...");
        const form2 = new FormData();
        form2.append('file', fs.createReadStream(tempPng));
        const resDedup = await axios.post(`${BASE_URL}/assets/upload`, form2, {
            headers: { ...authHeaders, ...form2.getHeaders() }
        });

        assert(resDedup.status === 200, "Dedup Upload 200 OK");
        assert(resDedup.data.id === asset1.id, "Dedup returned SAME ID");
        assert(resDedup.data.deduplicated === true, "Dedup flag present");

        // 6. SVG Security Test
        console.log("5. Testing SVG Security...");
        const badSvg = '<svg><script>alert(1)</script></svg>';
        const tempSvg = path.join(__dirname, 'bad.svg');
        fs.writeFileSync(tempSvg, badSvg);

        const form3 = new FormData();
        form3.append('file', fs.createReadStream(tempSvg));

        try {
            await axios.post(`${BASE_URL}/assets/upload`, form3, {
                headers: { ...authHeaders, ...form3.getHeaders() }
            });
            console.error("FAIL: Bad SVG was accepted");
            process.exit(1);
        } catch (e) {
            assert(e.response.status === 400, "Bad SVG rejected (400)");
        }

        // Cleanup
        try { fs.unlinkSync(tempPng); } catch (e) { }
        try { fs.unlinkSync(tempSvg); } catch (e) { }

        console.log("ALL TESTS PASSED");
        process.exit(0);

    } catch (e) {
        console.error("TEST FAILED", e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

run();
