const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse'); // Fallback
const nicolazziInvoiceTable = require('./server/src/engine/nicolazziInvoiceTableExtraction');

// Try to load the project's Poppler utility
let popplerText = null;
try {
    const p = require('./server/src/utils/popplerText');
    popplerText = p.pdfBufferToTextPoppler;
    console.log('[AUDIT] Loaded project Poppler utility successfully.');
} catch (e) {
    console.warn('[AUDIT] Failed to load Poppler utility:', e.message);
}

const inputDir = path.resolve(__dirname, 'TMP');

console.log('--- STARTING HIGH-FIDELITY EXTRACTION AUDIT (POPPLER) ---\n');

(async () => {
    // 1. Get List of Files
    const files = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
        console.error('No PDF files found in TMP.');
        return;
    }

    const results = [];

    // 2. Process Each File
    for (const f of files) {
        const filePath = path.join(inputDir, f);
        try {
            const buf = fs.readFileSync(filePath);
            let text = '';

            // A. Try Poppler (High Fidelity)
            if (popplerText) {
                try {
                    // Force the -layout flag behavior if the utility supports options, 
                    // or rely on its default which should match prod env.
                    text = await popplerText(buf);
                    // console.log(`[${f}] Extracted with Poppler (${text.length} chars)`);
                } catch (pe) {
                    console.warn(`[${f}] Poppler failed, falling back to pdf-parse:`, pe.message);
                }
            }

            // B. Fallback to pdf-parse if Poppler failed or not available
            if (!text || text.length < 100) {
                const parsed = await pdf(buf);
                text = parsed.text;
                // console.log(`[${f}] Extracted with pdf-parse (${text.length} chars)`);
            }

            // Run Extractor
            const extracted = nicolazziInvoiceTable(text);

            // Clean up for display (normalize)
            const summary = {
                file: f,
                data: extracted || {}
            };
            results.push(summary);

        } catch (e) {
            console.error(`Error processing ${f}:`, e.message);
        }
    }

    // 3. Render Table 1: Headers
    console.log('### TABELA 1: CABEÇALHOS (HEADERS)\n');
    console.log('| Ficheiro | Nº Doc | Data | Ref. Proj | Shipping Marks | Cliente | Fornecedor |');
    console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

    results.forEach(r => {
        const d = r.data;
        const custRef = (d.docRefs && d.docRefs[0]) || d.projectRef || '-';
        const shipMarks = d.shippingMarks || '(vazio)';

        // Handle Customer Object or String
        let customer = '-';
        if (d.entities?.customer) {
            customer = typeof d.entities.customer === 'string' ? d.entities.customer : (d.entities.customer.name || '-');
        }

        const supplier = (d.entities && d.entities.supplier && d.entities.supplier.name) || 'NICOLAZZI'; // Default

        console.log(`| ${r.file} | ${d.docNumber || '-'} | ${d.date || '-'} | ${custRef} | **${shipMarks}** | ${customer} | ${supplier} |`);
    });

    console.log('\n\n### TABELA 2: LINHAS (ITEMS)\n');

    // 4. Render Table 2: Lines (Key: File -> Table)
    results.forEach(r => {
        console.log(`#### Documento: ${r.file} (${r.data.docNumber || 'Sem Nº'})`);
        const lines = r.data.lines || [];

        if (lines.length === 0) {
            console.log('> (Nenhuma linha extraída)');
        } else {
            console.log('| SKU | Descrição | Qtd | Preço Unit | Desc % | Total |');
            console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');
            lines.forEach(l => {
                const desc = (l.description || '').replace(/\|/g, '-').substring(0, 50); // Sanitize markdown
                console.log(`| ${l.code || '-'} | ${desc} | ${l.quantity} | ${l.unitPrice} | ${l.discountPercent || l.discountText || '-'} | ${l.total} |`);
            });
        }
        console.log('\n'); // Spacer
    });


    // 5. Render Table 3: Totals
    console.log('### TABELA 3: TOTAIS (FOOTER)\n');
    console.log('| Ficheiro | Líquido (Net) | IVA (VAT) | Portes | Total (Gross) | Notas |');
    console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');

    results.forEach(r => {
        const d = r.data;
        const t = d.totals || {};

        // Normalize
        const net = t.net || t.goods || '-';
        const vat = t.vat || t.tax || '-';
        const trans = t.transport || '-';
        const gross = t.gross || t.total || '-';
        const notes = (d.notes || '').replace(/\n/g, ' ');

        console.log(`| ${r.file} | ${net} | ${vat} | ${trans} | **${gross}** | ${notes} |`);
    });

    console.log('\n--- END OF AUDIT ---');

})();
