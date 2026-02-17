
const knex = require('../server/src/db/knex');
const CustomerService = require('../server/src/modules/crm/CustomerService');

async function run() {
    try {
        console.log("--- EXISTING CUSTOMERS ---");
        const allCustomers = await knex('customers').select('*');
        if (allCustomers.length === 0) {
            console.log("No customers found in DB.");
        } else {
            console.table(allCustomers.map(c => ({
                id: c.id,
                vat: c.vat,
                name: c.name,
                project: c.project
            })));
        }

        console.log("\n--- TESTING UPSERT LOGIC ---");
        const mockProject = "Dvtkb";
        const mockData = {
            vat: "999999990", // NIF Exemplo
            name: "Cliente Teste Debug",
            address: "Rua do Debug"
        };

        // 1. Force Insert in 'default' first to test collision
        const defaultData = { ...mockData, name: "Cliente Default" };
        await CustomerService.upsertFromExtraction('default', defaultData);
        console.log("Inserted 'default' customer.");

        // 2. Try to insert same VAT in 'Dvtkb'
        console.log(`Attempting Upsert for project '${mockProject}'...`);
        const result = await CustomerService.upsertFromExtraction(mockProject, mockData);

        console.log("Upsert Result Project:", result.project);

        if (result.project !== mockProject) {
            console.log("❌ PROBLEM CONFIRMED: Returned customer belongs to", result.project, "but we wanted", mockProject);
        } else {
            console.log("✅ New customer created correctly for", mockProject);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await knex.destroy();
    }
}

run();
