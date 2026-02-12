
const ProposalExporter = require('./server/src/modules/proposalStudio/ProposalExporter');
const fs = require('fs');
const path = require('path');

async function testPagination() {
    console.log("Generating Long Proposal PDF...");

    const lines = [];
    // Generate 50 lines to force multiple pages
    for (let i = 1; i <= 50; i++) {
        lines.push({
            id: i,
            sku: `PROD-${i.toString().padStart(3, '0')}`,
            description: `Produto de Teste ${i}\nCom quebra de linha manual.\nE mais texto para forçar wrapping automático também.`,
            quantity: 1,
            unit_price_commercial: 100.00,
            discount_commercial_percent: 10
        });
    }

    const proposal = {
        name: 'Proposta: TESTE-PAGINACAO-001',
        client_ref: 'Cliente Teste Limitada',
        project_ref: 'PROJ-2026-TEST',
        updated_at: new Date(),
        metadata: {
            client_vat: '123456789',
            client_email: 'teste@email.com',
            our_ref: 'DIV-2026-001'
        },
        lines: lines
    };

    try {
        const buffer = await ProposalExporter.generatePdf(proposal, null);
        fs.writeFileSync('test_pagination.pdf', buffer);
        console.log("✅ PDF Generated: test_pagination.pdf");
        console.log("Please check if it has multiple pages, headers on page 2, and totals at the end.");
    } catch (e) {
        console.error("❌ Generation Failed:", e);
    }
}

testPagination();
