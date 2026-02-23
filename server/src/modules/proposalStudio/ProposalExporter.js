
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const xlsx = require('xlsx');

function fmtEUR(n) {
    const v = Number.isFinite(+n) ? +n : 0;
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

function safeText(s) {
    const map = {
        '€': 'EUR', '•': '*', '–': '-', '—': '-', '−': '-', '…': '...', '’': "'", '‘': "'", '“': '"', '”': '"',
        '→': '->', '⇒': '=>', '«': '"', '»': '"', 'º': 'o', 'ª': 'a',
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n',
        'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
        'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
        'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
        'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
        'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
        'Ç': 'C', 'Ñ': 'N',
        '\u00A0': ' ' // Non-breaking space
    };
    return String(s ?? '')
        .replace(/[\u0080-\uFFFF]/g, m => map[m] || '?') // Brute force fallback
        .replace(/[^\x20-\x7E\x0A\x0D]/g, ''); // Keep only Printable ASCII
}

class ProposalPdfEngine {
    constructor(proposal, appLogoPath) {
        this.proposal = proposal;
        this.appLogoPath = appLogoPath;
        this.pdf = null;
        this.font = null;
        this.fontB = null;
        this.logoImage = null;

        // Layout Config
        this.margin = 40;
        this.width = 595;
        this.height = 842;
        this.y = 0; // Current Y cursor
        this.currentPage = null;
        this.pages = [];

        // Table Config - Adjusted to fit 515px (Width 595 - 80 Margins)
        // Previous Sum: 530 (Overflow)
        // New Sum: 485
        this.colWidths = [70, 35, 180, 40, 30, 65, 65];
        this.headers = ['Codigo', 'Qtd', 'Descricao', 'Obs', 'UN', 'P.Unit', 'Total'];
    }

    async init() {
        this.pdf = await PDFDocument.create();
        this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
        this.fontB = await this.pdf.embedFont(StandardFonts.HelveticaBold);

        if (this.appLogoPath && fs.existsSync(this.appLogoPath)) {
            const bytes = fs.readFileSync(this.appLogoPath);
            // Detect type? Assuming PNG for now based on previous code.
            // If jpg, use embedJpg. Ideally detect extension.
            if (this.appLogoPath.toLowerCase().endsWith('.jpg') || this.appLogoPath.toLowerCase().endsWith('.jpeg')) {
                this.logoImage = await this.pdf.embedJpg(bytes);
            } else {
                this.logoImage = await this.pdf.embedPng(bytes);
            }
        }
    }

    addNewPage() {
        this.currentPage = this.pdf.addPage([this.width, this.height]);
        this.pages.push(this.currentPage);
        this.y = this.height - this.margin;

        // If it's NOT the first page, we might want to skip the big header and just do a small header?
        // For now, let's keep it simple: First page gets full header, subsequent pages get "Continuation" header?
        // Or standard header on all pages. Let's do standard Header on Page 1, and simplified on others to save space?
        // User didn't specify, but standard practice is full header on page 1, simplified on others.

        if (this.pages.length === 1) {
            this.drawFullHeader();
        } else {
            this.drawContinuationHeader();
        }
    }

    drawText(txt, x, size = 9, font = this.font, color = rgb(0, 0, 0), align = 'left') {
        const text = safeText(txt);
        const width = font.widthOfTextAtSize(text, size);
        let finalX = x;
        if (align === 'right') finalX = x - width;
        else if (align === 'center') finalX = x - (width / 2);

        this.currentPage.drawText(text, { x: finalX, y: this.y - size, size, font, color });
    }

    drawFullHeader() {
        // --- HEADER (Page 1) ---
        const { proposal } = this;
        let startY = this.y;

        // Left Side: Seller Info
        const leftX = this.margin;
        this.drawText('DVTKB, Lda', leftX, 11, this.fontB); this.y -= 14;
        this.drawText('www.divitek.pt', leftX, 9, this.font, rgb(0.3, 0.3, 0.3)); this.y -= 18;

        this.drawText('Morada:', leftX, 9, this.fontB);
        this.drawText('Rua da Baixa 326, 3 Drt', leftX + 45, 9); this.y -= 11;
        this.drawText('2870-231 Montijo, Portugal', leftX + 45, 9); this.y -= 14;

        this.drawText('Telefone:', leftX, 9, this.fontB);
        this.drawText('918504499', leftX + 45, 9); this.y -= 11;

        this.drawText('Email:', leftX, 9, this.fontB);
        this.drawText('geral@divitek.pt', leftX + 45, 9); this.y -= 11;

        this.drawText('NIF:', leftX, 9, this.fontB);
        this.drawText('PT515834807', leftX + 45, 9); this.y -= 20;

        // Right Side: Proposal Info
        this.y = startY; // Reset Y for right column
        const rightX = 350;

        this.currentPage.drawText('PROPOSTA', { x: rightX, y: this.y - 14, size: 14, font: this.fontB });
        this.y -= 24;

        this.currentPage.drawText('Nº Proposta:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(proposal.name.split('-')[0].replace('Proposta:', '').trim() || 'PROP-2026-XXX', { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('Cliente:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.client_ref || 'Consumidor Final'), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('NIF:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.client_vat || '999999999'), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('Contato:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.client_contact || ''), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('Email:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.client_email || ''), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        // Adjust Y to below the lowest column
        this.y = Math.min(this.y, startY - 110) - 20;

        // --- PROJECT ROW ---
        this.currentPage.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        this.y -= 15;

        // this.drawText('Projeto:', this.margin, 9, this.fontB);
        // this.drawText(proposal.project_ref || 'N/A', this.margin + 45, 9);

        const metaX = this.margin;
        this.currentPage.drawText('Ref. Proj.:', { x: metaX, y: this.y - 9, size: 8, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.our_ref || ''), { x: metaX, y: this.y - 18, size: 8, font: this.font });

        if (proposal.metadata?.client_project_name) {
            this.currentPage.drawText('Projeto (Cliente):', { x: metaX + 100, y: this.y - 9, size: 8, font: this.fontB });
            this.currentPage.drawText(safeText(proposal.metadata.client_project_name), { x: metaX + 100, y: this.y - 18, size: 8, font: this.font });
        }

        const rightMetaX = 350;
        this.currentPage.drawText('Validade:', { x: rightMetaX + 80, y: this.y - 9, size: 8, font: this.fontB });
        this.currentPage.drawText('15 dias', { x: rightMetaX + 80, y: this.y - 18, size: 8, font: this.font });

        this.currentPage.drawText('Data:', { x: rightMetaX + 150, y: this.y - 9, size: 8, font: this.fontB });
        this.currentPage.drawText(new Date(proposal.updated_at).toLocaleDateString('pt-PT'), { x: rightMetaX + 150, y: this.y - 18, size: 8, font: this.font });

        this.y -= 30;
    }

    drawContinuationHeader() {
        this.drawText('PROPOSTA (Continuação)', this.width - this.margin, 10, this.fontB, rgb(0.5, 0.5, 0.5), 'right');
        this.drawText(`Nº: ${safeText(this.proposal.name)}`, this.width - this.margin, 8, this.font, rgb(0.5, 0.5, 0.5), 'right');
        this.y -= 30;
    }

    drawFooter() {
        // Draw footer on current page
        const footerY = this.margin + 40;
        this.currentPage.drawText('Pagamento por transferência bancária para o IBAN:', this.margin, footerY, { size: 8, font: this.fontB, color: rgb(0.4, 0.4, 0.4) });
        this.currentPage.drawText('BPI: PT50 0010 0000 5819 1020 0010 2', this.margin, footerY - 10, { size: 8, font: this.font, color: rgb(0.4, 0.4, 0.4) });

        this.currentPage.drawText('Este documento não serve de fatura', {
            x: this.width - this.margin - 150,
            y: this.margin + 30,
            size: 8,
            font: this.font,
            color: rgb(0.5, 0.5, 0.5)
        });

        // Page Number gets drawn later on all pages
    }

    drawTableHeaders() {
        let tx = this.margin;
        this.headers.forEach((h, i) => {
            this.drawText(h, tx, 9, this.fontB);
            tx += this.colWidths[i];
        });
        this.y -= 5;
        this.currentPage.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 1, color: rgb(0, 0, 0) });
        this.y -= 15;
    }

    splitTextToLines(text, size, maxWidth) {
        const rawLines = safeText(text).split(/\r?\n/);
        const finalLines = [];

        for (const rawLine of rawLines) {
            const words = rawLine.split(' ');
            let currentLine = words[0];

            for (let i = 1; i < words.length; i++) {
                const word = words[i];
                const width = this.font.widthOfTextAtSize(currentLine + ' ' + word, size);
                if (width < maxWidth) {
                    currentLine += ' ' + word;
                } else {
                    finalLines.push(currentLine);
                    currentLine = word;
                }
            }
            if (currentLine) finalLines.push(currentLine);
        }
        return finalLines;
    }

    checkSpace(neededHeight) {
        // Footer takes up ~60px. Bottom margin is 40. Safe gap 20. Total 120 from bottom. 
        const footerSpace = 100;
        if (this.y - neededHeight < footerSpace) {
            this.drawFooter(); // Draw footer on the full page before leaving
            this.addNewPage();
            this.drawTableHeaders(); // Repeat headers on new page
        }
    }

    process() {
        this.addNewPage();
        this.drawTableHeaders();

        let totalSiva = 0;

        // Draw Lines
        this.proposal.lines.forEach(line => {
            const lineTotal = (line.quantity || 0) * (line.unit_price_commercial || 0);
            totalSiva += lineTotal;

            // Description and Extra Details
            let fullDescription = line.description || '';
            const extraLines = [];

            // Dynamic Predicted Date Calculation
            const effectiveLeadWeeks = line.lead_time_weeks || this.proposal.general_lead_time_weeks || 0;
            let predictedDateDisplay = line.predicted_ship_date ? new Date(line.predicted_ship_date).toLocaleDateString('pt-PT') : '';
            if (!predictedDateDisplay && effectiveLeadWeeks > 0) {
                const baseDate = this.proposal.order_confirmation_date
                    ? new Date(this.proposal.order_confirmation_date)
                    : (this.proposal.metadata?.doc_date ? new Date(this.proposal.metadata.doc_date) : null);

                if (baseDate) {
                    baseDate.setDate(baseDate.getDate() + (effectiveLeadWeeks * 7));
                    predictedDateDisplay = baseDate.toLocaleDateString('pt-PT');
                }
            }

            if (predictedDateDisplay) {
                extraLines.push(`PRAZO PREVISTO: ${predictedDateDisplay}`);
            }

            if (this.proposal.metadata?.show_technical_details) {
                const extra = line.extra_attributes || {};
                const finishCode = extra.finish_code || extra.brand_meta?.finishCode;
                const finishNote = extra.finish_note || extra.brand_meta?.finishNote;

                if (finishCode) extraLines.push(`Acabamento: ${finishCode}`);
                if (extra.original_description) extraLines.push(`Desc. Original: ${extra.original_description}`);
                if (extra.collection || extra.series) extraLines.push(`Serie: ${extra.collection || extra.series}`);
            }

            const mainDescLines = this.splitTextToLines(fullDescription, 9, this.colWidths[2] - 10);
            const detailLines = extraLines.flatMap(el => this.splitTextToLines(el, 7, this.colWidths[2] - 15));

            const rowHeight = Math.max(15, (mainDescLines.length * 10) + (detailLines.length * 8) + 10);

            this.checkSpace(rowHeight);

            const row = [
                line.sku,
                String(line.quantity),
                '', // Description (handled specially)
                '', // Obs
                'UN',
                fmtEUR(line.unit_price_commercial).replace('€', ''),
                fmtEUR(lineTotal).replace('€', '')
            ];

            let lx = this.margin;
            row.forEach((text, i) => {
                if (i === 2) {
                    let dy = 0;
                    mainDescLines.forEach(dl => {
                        this.drawText(dl, lx, 9, this.font, rgb(0, 0, 0));
                        dy += 10;
                    });
                    const topY = this.y;
                    this.y -= dy;
                    detailLines.forEach(dl => {
                        this.drawText(dl, lx + 2, 7, this.font, rgb(0.4, 0.4, 0.4));
                        this.y -= 8;
                    });
                    this.y = topY; // Reset Y to top for next columns
                } else {
                    this.drawText(text, lx, 9, this.font, rgb(0, 0, 0));
                }
                lx += this.colWidths[i];
            });

            this.y -= (rowHeight + 5);
        });

        // Totals Block
        const totalsHeight = 100;
        this.checkSpace(totalsHeight);

        this.y -= 10;
        const totalsX = 400;
        const width = this.width;

        const drawTotalLine = (label, value, isBold = false) => {
            this.currentPage.drawText(label + ':', { x: totalsX, y: this.y - 10, size: 9, font: isBold ? this.fontB : this.font });
            this.drawText(value, width - this.margin, 9, isBold ? this.fontB : this.font, rgb(0, 0, 0), 'right');
            this.y -= 14;
        };

        drawTotalLine('Total (s/IVA)', fmtEUR(totalSiva));
        drawTotalLine('Embalagem', fmtEUR(0));
        drawTotalLine('Portes', fmtEUR(0));

        const iva = totalSiva * 0.23;
        drawTotalLine('IVA (23%)', fmtEUR(iva));

        this.y -= 5;
        this.currentPage.drawLine({ start: { x: totalsX, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.5 });
        this.y -= 5;

        drawTotalLine('Total (c/IVA)', fmtEUR(totalSiva + iva), true);

        // --- TECHNICAL ANNEX (Server Side) ---
        const uniqueFinishes = [];
        const finishCheck = new Set();
        this.proposal.lines.forEach(line => {
            const extra = line.extra_attributes || {};
            const note = extra.finish_note || extra.brand_meta?.finishNote;
            const code = extra.finish_code || extra.brand_meta?.finishCode || '';
            const key = `${code}|${note}`;
            if (note && !finishCheck.has(key)) {
                finishCheck.add(key);
                uniqueFinishes.push({ code, note });
            }
        });

        if (uniqueFinishes.length > 0) {
            this.drawFooter();
            this.addNewPage();
            this.y = this.height - this.margin;
            this.drawContinuationHeader();
            this.y -= 20;

            this.drawText('ANEXO: ESPECIFICAÇÕES TÉCNICAS DE ACABAMENTOS', this.margin, 12, this.fontB, rgb(0, 0, 0));
            this.y -= 25;

            uniqueFinishes.forEach(f => {
                const title = f.code ? `Acabamento: ${f.code}` : 'Especificação Técnica';
                const noteLines = this.splitTextToLines(f.note, 9, this.width - (this.margin * 2) - 20);
                const blockHeight = (noteLines.length * 12) + 30;

                this.checkSpace(blockHeight);

                this.drawText(title, this.margin, 10, this.fontB, rgb(0.1, 0.1, 0.1));
                this.y -= 14;
                noteLines.forEach(ln => {
                    this.drawText(ln, this.margin + 5, 8.5, this.font, rgb(0.3, 0.3, 0.3));
                    this.y -= 11;
                });
                this.y -= 15;
            });
        }

        // Final Footer
        this.drawFooter();

        // Page Numbering
        const totalPages = this.pages.length;
        this.pages.forEach((p, i) => {
            p.drawText(`Pág ${i + 1} / ${totalPages}`, {
                x: this.width - 60,
                y: 15,
                size: 8,
                font: this.font,
                color: rgb(0.6, 0.6, 0.6)
            });
        });
    }

    async getBytes() {
        return await this.pdf.save();
    }
}

class ProposalExporter {
    async generatePdf(proposal, appLogoPath) {
        const engine = new ProposalPdfEngine(proposal, appLogoPath);
        await engine.init();
        engine.process();
        const bytes = await engine.getBytes();
        return Buffer.from(bytes);
    }

    // Kept existing Excel logic unchanged for safety
    async generateExcel(proposal) {
        const rows = proposal.lines.map(l => {
            const extra = l.extra_attributes || {};

            // Dynamic Predicted Date Calculation
            const effectiveLeadWeeks = l.lead_time_weeks || proposal.general_lead_time_weeks || 0;
            let predictedDateDisplay = l.predicted_ship_date ? new Date(l.predicted_ship_date).toLocaleDateString('pt-PT') : '';

            if (!predictedDateDisplay && effectiveLeadWeeks > 0) {
                const baseDate = proposal.order_confirmation_date
                    ? new Date(proposal.order_confirmation_date)
                    : (proposal.metadata?.doc_date ? new Date(proposal.metadata.doc_date) : null);

                if (baseDate) {
                    baseDate.setDate(baseDate.getDate() + (effectiveLeadWeeks * 7));
                    predictedDateDisplay = baseDate.toLocaleDateString('pt-PT');
                }
            }

            return {
                'Projeto': proposal.metadata?.client_project_name || '',
                'NIF': proposal.metadata?.client_vat || '',
                'Morada Faturação': proposal.metadata?.billing_address || '',
                'Morada Entrega': proposal.metadata?.shipping_is_billing ? 'Igual à faturação' : (proposal.metadata?.shipping_address || ''),
                'Codigo': l.sku,
                'Descrição': l.description,
                'Coleção': extra.collection || extra.series || '',
                'Quantidade': l.quantity,
                'Previsão Entrega': predictedDateDisplay,
                'Preço Unitário': l.unit_price_commercial,
                'Desconto %': l.discount_commercial_percent,
                'Subtotal': l.quantity * l.unit_price_commercial * (1 - (l.discount_commercial_percent / 100))
            };
        });

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);

        const rowCount = rows.length;
        for (let i = 0; i < rowCount; i++) {
            const rowIdx = i + 2;
            const qtyCell = xlsx.utils.encode_cell({ c: 7, r: rowIdx - 1 });
            const priceCell = xlsx.utils.encode_cell({ c: 9, r: rowIdx - 1 });
            const discCell = xlsx.utils.encode_cell({ c: 10, r: rowIdx - 1 });
            const subtotalCell = xlsx.utils.encode_cell({ c: 11, r: rowIdx - 1 });

            ws[subtotalCell] = { f: `${qtyCell}*${priceCell}*(1-${discCell}/100)`, t: 'n' };
        }

        xlsx.utils.book_append_sheet(wb, ws, "Proposta");
        return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }
    async generateConsolidatedItemsExcel(proposals) {
        const flatRows = [];

        for (const p of proposals) {
            const lines = p.lines || [];
            lines.forEach(l => {
                flatRows.push({
                    'Proposta': p.name || '',
                    'Estado': p.status || '',
                    'Marca': p.brand_id || '',
                    'Cliente': p.client_ref || '',
                    'Data': p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-PT') : '',
                    'SKU/Artigo': l.sku || '',
                    'Descrição': l.description || '',
                    'Quantidade': l.quantity || 0,
                    'P.Unit Com.': l.unit_price_commercial || 0,
                    'IVA %': l.vat_rate || '23',
                    'Total Item (c/IVA)': (l.quantity * l.unit_price_commercial * (1 - (l.discount_commercial_percent / 100))) * (1 + parseFloat(l.vat_rate || 23) / 100)
                });
            });
        }

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(flatRows);
        xlsx.utils.book_append_sheet(wb, ws, "Listagem de Itens");
        return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }
}

module.exports = new ProposalExporter();
