const CustomerService = require('../server/src/modules/crm/CustomerService');

async function testSearch() {
    const project = 'Proj_2026';

    console.log(`--- CRM Search Diagnostic (Project: ${project}) ---`);

    // Test 1: Search by partial name
    const queryName = 'DVTKB';
    console.log(`\nTesting search for Name: "${queryName}"`);
    const resName = await CustomerService.search(project, queryName);
    console.log(`Results: ${resName.length}`);
    resName.forEach(r => console.log(` - ${r.name} (${r.vat}) [Project: ${r.project}]`));

    // Test 2: Search by partial VAT (without PT)
    const queryVatRaw = '515834807';
    console.log(`\nTesting search for VAT (Raw): "${queryVatRaw}"`);
    const resVatRaw = await CustomerService.search(project, queryVatRaw);
    console.log(`Results: ${resVatRaw.length}`);
    resVatRaw.forEach(r => console.log(` - ${r.name} (${r.vat}) [Project: ${r.project}]`));

    // Test 3: Search by full VAT (with PT)
    const queryVatFull = 'PT515834807';
    console.log(`\nTesting search for VAT (Full): "${queryVatFull}"`);
    const resVatFull = await CustomerService.search(project, queryVatFull);
    console.log(`Results: ${resVatFull.length}`);
    resVatFull.forEach(r => console.log(` - ${r.name} (${r.vat}) [Project: ${r.project}]`));

    // Test 4: Search in wrong project
    const wrongProject = 'default';
    console.log(`\nTesting search in WRONG project ("${wrongProject}") for "DVTKB"`);
    const resWrong = await CustomerService.search(wrongProject, queryName);
    console.log(`Results: ${resWrong.length}`);
}

testSearch().then(() => process.exit());
