
const SmartLookupService = require('./server/src/modules/crm/SmartLookupService');

async function debug() {
    console.log('--- Debugging SmartLookupService ---');

    // Test 1: VIES (Microsoft PT)
    console.log('\n1. Testing VIES (503591963 - Microsoft)...');
    try {
        const res1 = await SmartLookupService.lookup('503591963');
        console.log('Result 1:', JSON.stringify(res1, null, 2));
    } catch (e) {
        console.error('Error 1:', e);
    }

    // Test 2: Nominatim (Lisboa)
    console.log('\n2. Testing Nominatim (Lisboa)...');
    try {
        const res2 = await SmartLookupService.lookup('Lisboa');
        console.log('Result 2:', JSON.stringify(res2, null, 2));
    } catch (e) {
        console.error('Error 2:', e);
    }
}

debug();
