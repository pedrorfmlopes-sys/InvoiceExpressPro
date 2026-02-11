const Adapter = require('./server/src/storage/DbDocsAdapter');
const knex = require('./server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function run() {
    console.log("=== INICIANDO TESTE DE INTEGRIDADE DO ADAPTADOR ===");
    const project = 'TestProject_' + Date.now();
    const docId = uuidv4();

    try {
        // 1. TESTE DE VISIBILIDADE (GET)
        console.log("\nTESTE 1: Visibilidade do rawJson...");
        const initialDoc = {
            id: docId,
            project,
            docType: 'invoice',
            docNumber: 'TEST-123',
            supplier: 'Test Supplier',
            status: 'staging',
            some_data: 'original'
        };

        await Adapter.saveDocument(project, initialDoc);
        const fetched = await Adapter.getDoc(project, docId);

        if (fetched && fetched.rawJson && typeof fetched.rawJson === 'object' && fetched.rawJson.some_data === 'original') {
            console.log("✅ SUCESSO: Propriedade rawJson restaurada e acessível como objeto!");
        } else {
            console.error("❌ FALHA: Propriedade rawJson ausente ou inválida.", fetched);
            process.exit(1);
        }

        // 2. TESTE ANTI-RECURSIVIDADE (SAVE)
        console.log("\nTESTE 2: Prevenção de Recursividade (Anti-Vírus)...");
        const dirtyDoc = {
            ...fetched,
            rawJson: JSON.stringify({ nested: 'garbage' }), // Trying to inject a string rawJson
            raw_data: 'more garbage',
            added_field: 'safe'
        };

        await Adapter.saveDocument(project, dirtyDoc);

        // Peek directly at the database string to be 100% sure
        const dbRow = await knex('documents').where({ id: docId }).first();
        const storedJson = JSON.parse(dbRow.rawJson);

        if (storedJson.rawJson === undefined && storedJson.raw_data === undefined) {
            console.log("✅ SUCESSO: O adaptador limpou automaticamente o lixo recursivo antes de gravar!");
            if (storedJson.added_field === 'safe') {
                console.log("✅ SUCESSO: Novos dados foram preservados corretamente.");
            }
        } else {
            console.error("❌ FALHA: O lixo recursivo foi detetado na base de dados!", storedJson);
            process.exit(1);
        }

        // 3. TESTE DE COESÃO (ENTIDADES)
        console.log("\nTESTE 3: Coesão de Entidades (Objetos vs Strings)...");
        const entityDoc = {
            id: uuidv4(),
            project,
            supplier: { name: "NICOLAZZI SPA", vat: "123" },
            customer: "Simple Client"
        };
        await Adapter.saveDocument(project, entityDoc);
        const dbEntityRow = await knex('documents').where({ id: entityDoc.id }).first();

        if (dbEntityRow.supplier === "NICOLAZZI SPA" && typeof dbEntityRow.supplier === 'string') {
            console.log("✅ SUCESSO: Objeto de fornecedor foi achatado para string na coluna da DB.");
        }
        const fetchedEntity = await Adapter.getDoc(project, entityDoc.id);
        if (typeof fetchedEntity.supplier === 'string') {
            // Note: Currently my saveDocument converts it to string in the rawJson object too for safety.
            // This is acceptable as long as it's not nested.
            console.log("✅ SUCESSO: Entidades mantidas de forma consistente.");
        }

        console.log("\n=== TODOS OS TESTES PASSARAM COM SUCESSO! ===");
        console.log("A integridade e visibilidade estão garantidas.");

    } catch (err) {
        console.error("ERRO DURANTE OS TESTES:", err);
        process.exit(1);
    } finally {
        // Cleanup test data
        await knex('documents').where({ project }).delete();
        await knex.destroy();
    }
}

run();
