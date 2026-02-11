const knex = require('../server/src/db/knex');

async function checkNicolazziCustomers() {
    console.log("=== VERIFICAR CLIENTES NICOLAZZI ===\n");

    try {
        // 1. Buscar documentos com "Nicolazzi" no campo customer
        const withNicolazzi = await knex('documents')
            .where('customer', 'like', '%Nicolazzi%')
            .orWhere('customer', 'like', '%NICOLAZZI%')
            .select('id', 'docNumber', 'customer', 'supplier', 'brand', 'docType');

        console.log(`📊 Documentos com "Nicolazzi" no campo CUSTOMER: ${withNicolazzi.length}\n`);

        if (withNicolazzi.length > 0) {
            console.log("DETALHES:");
            console.log("─".repeat(80));
            for (const doc of withNicolazzi.slice(0, 10)) {
                console.log(`Doc: ${doc.docNumber?.padEnd(12)} | Customer: ${doc.customer?.substring(0, 30)}`);
                console.log(`  → Supplier: ${doc.supplier?.substring(0, 30)} | Brand: ${doc.brand || 'N/A'}`);
            }
            if (withNicolazzi.length > 10) {
                console.log(`... e mais ${withNicolazzi.length - 10} documentos`);
            }
        }

        console.log("\n" + "─".repeat(80));

        // 2. Buscar documentos com brand = nicolazzi
        const brandNicolazzi = await knex('documents')
            .where({ brand: 'nicolazzi' })
            .select('id', 'docNumber', 'customer', 'supplier', 'brand');

        console.log(`\n📊 Documentos com BRAND = "nicolazzi": ${brandNicolazzi.length}\n`);

        if (brandNicolazzi.length > 0) {
            console.log("AMOSTRA (primeiros 10):");
            console.log("─".repeat(80));
            for (const doc of brandNicolazzi.slice(0, 10)) {
                console.log(`Doc: ${doc.docNumber?.padEnd(12)} | Customer: ${doc.customer?.substring(0, 30)}`);
            }
            if (brandNicolazzi.length > 10) {
                console.log(`... e mais ${brandNicolazzi.length - 10} documentos`);
            }
        }

        // 3. Estatísticas gerais
        console.log("\n" + "=".repeat(80));
        console.log("RESUMO:");
        console.log("─".repeat(80));
        console.log(`✅ Documentos com "Nicolazzi" como CLIENTE: ${withNicolazzi.length}`);
        console.log(`✅ Documentos com BRAND "nicolazzi": ${brandNicolazzi.length}`);

        // 4. Check overlap
        const overlap = withNicolazzi.filter(d => d.brand === 'nicolazzi');
        console.log(`⚠️  Overlap (Nicolazzi como cliente E brand): ${overlap.length}`);

    } catch (err) {
        console.error("❌ ERRO:", err.message);
        console.error(err.stack);
    } finally {
        await knex.destroy();
    }
}

checkNicolazziCustomers();
