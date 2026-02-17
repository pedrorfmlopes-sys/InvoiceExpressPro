const Adapter = require('../server/src/storage/DbDocsAdapter');
const knex = require('../server/src/db/knex');

(async () => {
    try {
        const project = 'pedrorfmlopes-sys/InvoiceExpressPro';
        console.log(`Testing Adapter.getDocs for project: ${project}`);
        const res = await Adapter.getDocs(project, { status: 'staging', limit: 5 });
        console.log("Found:", res.total);
        console.log("Rows:", res.rows.length);
        if (res.rows.length > 0) {
            console.log("Sample:", res.rows[0].docNumber);
        }
    } catch (e) {
        console.error("Error", e);
    } finally {
        await knex.destroy();
    }
})();
