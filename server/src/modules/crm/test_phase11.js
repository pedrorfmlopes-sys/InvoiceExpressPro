const CustomerService = require('./CustomerService');
const ZipHelper = require('../../utils/ZipHelper');

async function test() {
    console.log("--- Phase 11 DRY RUN TEST ---");

    // 1. Test Normalize VAT
    const itVat = "01234567890"; // 11 digits
    const normalizedIt = CustomerService.normalizeVat(itVat);
    console.log(`Italian VAT (${itVat}) -> ${normalizedIt} (Expected: 01234567890)`);

    const ptVat = "123456789"; // 9 digits
    const normalizedPt = CustomerService.normalizeVat(ptVat);
    console.log(`Portuguese NIF (${ptVat}) -> ${normalizedPt} (Expected: PT123456789)`);

    // 2. Test Zip Inference
    const ptAddress = "Rua Teste, 1234-567 Lisboa";
    const itAddress = "Via Pietro Durio 119, 28010 Alzo (NO) Italia";

    console.log(`Country for PT Address: ${ZipHelper.inferCountryFromAddress(ptAddress)} (Expected: PT)`);
    console.log(`Country for IT Address: ${ZipHelper.inferCountryFromAddress(itAddress)} (Expected: IT)`);

    console.log("--- TEST COMPLETE ---");
}

test().catch(console.error);
