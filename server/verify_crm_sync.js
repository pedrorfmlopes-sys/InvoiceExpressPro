const axios = require('axios');

async function testSync() {
    const docId = 'test-doc-123'; // Replace with a real pending doc ID if needed, or just test the logic
    console.log(`--- SIMULATING GOLD VIEWER SAVE ---`);

    // Attempting to hit the local server
    try {
        const payload = {
            entities: {
                customer: {
                    name: "NICOLAZZI TEST CUSTOMER",
                    vat: "01234567891", // 11 digits
                    address: "Via Teste 1, 28010 IT"
                }
            }
        };

        // We need a real ID to avoid 404, let's find one first
        const knex = require('./src/db/knex');
        const doc = await knex('documents').where({ status: 'staging' }).first();

        if (!doc) {
            console.log("No staging document found to test with.");
            return;
        }

        const project = 'pedrorfmlopes-sys/InvoiceExpressPro';
        console.log(`Testing with Doc ID: ${doc.id} (Project: ${project})`);

        const response = await axios.patch(`http://localhost:3000/api/corev2/docs/${doc.id}?project=${project}`, payload);
        console.log("Response:", response.data);

        // Now check CRM
        const customer = await knex('customers').where({ vat: '01234567891' }).first();
        if (customer) {
            console.log("SUCCESS: Customer created in CRM!");
            console.log(customer);
        } else {
            console.log("FAILURE: Customer NOT found in CRM.");
        }

    } catch (e) {
        console.error("Test failed:", e.message);
        if (e.response) console.error("Response Data:", e.response.data);
    } finally {
        process.exit();
    }
}

testSync();
