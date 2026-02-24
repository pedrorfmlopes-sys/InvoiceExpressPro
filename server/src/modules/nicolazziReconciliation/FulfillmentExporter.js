const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

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
        '\u00A0': ' '
    };
    return String(s ?? '')
        .replace(/[\u0080-\uFFFF]/g, m => map[m] || '?')
        .replace(/[^\x20-\x7E\x0A\x0D]/g, '');
}

class FulfillmentPdfEngine {
    constructor(data) {
        this.data = data;
        this.pdf = null;
        this.font = null;
        this.fontB = null;

        // Layout Config
        this.margin = 40;
        this.width = 842; // Landscape (A4 is 595x842)
        this.height = 595;
        this.y = 0;
        this.currentPage = null;
        this.pages = [];

        // Adjusted column widths to spread across Landscape width 
        // W = 842 - 80 = 762 usable width
        this.colWidths = [120, 312, 110, 65, 65, 90];
        this.headers = ['SKU', 'Descrição', 'Previsto', 'Pedida', 'Fechada', 'Falta / Estado'];
    }

    // Instead of instantiating tightly with one 'data', we now allow injecting a new proposal data
    setProposalData(data) {
        this.data = data;
    }

    async init() {
        this.pdf = await PDFDocument.create();
        this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
        this.fontB = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    }

    addNewPage() {
        this.currentPage = this.pdf.addPage([this.width, this.height]);
        this.pages.push(this.currentPage);
        this.y = this.height - this.margin;

        this.drawHeader();
        this.drawTableHeaders();
    }

    drawText(txt, x, size = 9, font = this.font, color = rgb(0, 0, 0), align = 'left') {
        const text = safeText(txt);
        const textWidth = font.widthOfTextAtSize(text, size);
        let finalX = x;
        if (align === 'right') finalX = x - textWidth;
        else if (align === 'center') finalX = x - (textWidth / 2);

        this.currentPage.drawText(text, { x: finalX, y: this.y - size, size, font, color });
    }

    drawHeader() {
        // --- STATUS REPORT HEADER ---
        const startY = this.y;

        this.drawText('RELATÓRIO DE STATUS DE ENCOMENDA', this.margin, 14, this.fontB, rgb(0, 0, 0));
        this.drawText(safeText(this.data.proposal?.name || 'Proposta'), this.margin, 8, this.font, rgb(0.4, 0.4, 0.4));

        const rightX = this.width - this.margin;
        const dt = new Date().toLocaleDateString('pt-PT');
        this.drawText(`Gerado a: ${dt}`, rightX, 8, this.font, rgb(0.4, 0.4, 0.4), 'right');

        this.y -= 30;

        // Stats boxes
        const statsBaseY = this.y;

        // Progress text
        this.drawText(`PROGRESSO GERAL: ${this.data.stats.progress}%`, this.margin, 9, this.fontB);
        this.y -= 12;

        // Progress bar background
        const barWidth = 200;
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.y - 4,
            width: barWidth,
            height: 6,
            color: rgb(0.9, 0.9, 0.9)
        });

        // Progress bar fill (Green if 100%, blue otherwise)
        let fillR = 0.2, fillG = 0.5, fillB = 0.9;
        if (this.data.stats.progress >= 100) { fillR = 0.2; fillG = 0.8; fillB = 0.3; }

        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.y - 4,
            width: (this.data.stats.progress / 100) * barWidth,
            height: 6,
            color: rgb(fillR, fillG, fillB)
        });

        this.y = statsBaseY;

        // Client Info
        if (this.data.proposal?.client_ref) {
            this.drawText(`Cliente: ${this.data.proposal.client_ref}`, rightX, 10, this.fontB, rgb(0, 0, 0), 'right');
            this.y -= 15;
            if (this.data.proposal.metadata?.our_ref) {
                this.drawText(`Referência: ${this.data.proposal.metadata.our_ref}`, rightX, 9, this.font, rgb(0.3, 0.3, 0.3), 'right');
            }
        }

        this.y = startY - 60;
        this.currentPage.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        this.y -= 15;
    }

    drawTableHeaders() {
        let tx = this.margin;
        this.headers.forEach((h, i) => {
            let align = 'left';
            if (i >= 3 && i <= 5) align = 'right'; // numbers right aligned

            if (align === 'right') {
                this.drawText(h, tx + this.colWidths[i] - 5, 9, this.fontB, rgb(0, 0, 0), 'right');
            } else {
                this.drawText(h, tx, 9, this.fontB);
            }
            tx += this.colWidths[i];
        });

        this.y -= 8;
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
        const footerSpace = 40;
        if (this.y - neededHeight < footerSpace) {
            this.drawFooter();
            this.addNewPage();
        }
    }

    drawFooter() {
        const totalPages = this.pages.length;
        this.pages.forEach((p, i) => {
            p.drawText(`Pág ${i + 1} / ${totalPages}`, {
                x: this.width - 80,
                y: 15,
                size: 8,
                font: this.font,
                color: rgb(0.6, 0.6, 0.6)
            });
        });
    }

    process() {
        this.addNewPage();

        this.data.lines.forEach(line => {
            const isCompleted = line.qty_remaining <= 0;
            const isLate = false; // We can upgrade this logic if we have dates

            // Dates
            const shipDateDisplay = line.predicted_ship_date ? new Date(line.predicted_ship_date).toLocaleDateString('pt-PT') : 'N/D';

            // Split desc
            const descLines = this.splitTextToLines(line.description, 8, this.colWidths[1] - 10);

            // Warnings (if any history)
            let docsLabel = '';
            if (line.history && line.history.length > 0) {
                docsLabel = `Fats: ${line.history.map(h => h.doc_number).join(', ')}`;
            }
            const extraLines = this.splitTextToLines(docsLabel, 7, this.colWidths[1] - 10);

            const rowHeight = Math.max(15, (descLines.length * 10) + (extraLines.length * 8) + 10);
            this.checkSpace(rowHeight);

            // Columns layout: ['SKU', 'Descrição', 'Previsto', 'Pedida', 'Fechada', 'Falta']

            let statusColor = rgb(0.3, 0.3, 0.3); // Pendente (gray)
            let remLabel = String(line.qty_remaining);
            if (isCompleted) {
                statusColor = rgb(0.1, 0.6, 0.2); // Green
                remLabel = "OK (0)";
            } else if (line.qty_fulfilled > 0) {
                statusColor = rgb(0.8, 0.5, 0.0); // Orange/Partial
                remLabel = `Falta: ${line.qty_remaining}`;
            }

            const displaySku = this.data.proposal?.number ? `${this.data.proposal.number}\n${line.sku}` : line.sku;

            const rData = [
                displaySku,
                '', // Handled custom
                shipDateDisplay,
                String(line.qty_ordered),
                String(line.qty_fulfilled),
                remLabel
            ];

            // Draw Background subtly if completed
            if (isCompleted) {
                this.currentPage.drawRectangle({
                    x: this.margin,
                    y: this.y - rowHeight + 5,
                    width: this.width - (this.margin * 2),
                    height: rowHeight,
                    color: rgb(0.96, 0.98, 0.96)
                });
            }

            let lx = this.margin;
            rData.forEach((text, i) => {
                let align = 'left';
                if (i >= 3 && i <= 5) align = 'right';

                if (i === 1) { // Desc
                    const topY = this.y;
                    descLines.forEach(dl => {
                        this.drawText(dl, lx, 8, this.font, rgb(0, 0, 0));
                        this.y -= 10;
                    });
                    extraLines.forEach(el => {
                        this.drawText(el, lx, 7, this.font, rgb(0.5, 0.5, 0.5));
                        this.y -= 8;
                    });
                    this.y = topY;
                } else if (i === 0) { // SKU with Proposal No
                    const skuLines = text.split('\n');
                    const topY = this.y;
                    skuLines.forEach((sl, sIdx) => {
                        const isMainSku = sIdx === skuLines.length - 1;
                        const cColor = isMainSku ? rgb(0, 0, 0) : rgb(0.5, 0.5, 0.5);
                        const cSize = isMainSku ? 8 : 7;
                        this.drawText(sl, lx, cSize, isMainSku ? this.fontB : this.font, isCompleted ? rgb(0.4, 0.4, 0.4) : cColor, align);
                        this.y -= 10;
                    });
                    this.y = topY;
                } else if (i === 5) {
                    // Status 
                    this.drawText(text, lx + this.colWidths[i] - 5, 9, this.fontB, statusColor, align);
                } else {
                    let c = rgb(0, 0, 0);
                    if (isCompleted) c = rgb(0.4, 0.4, 0.4); // fade out completed lines a bit

                    if (align === 'right') {
                        this.drawText(text, lx + this.colWidths[i] - 5, 8, this.font, c, align);
                    } else {
                        this.drawText(text, lx, 8, this.font, c, align);
                    }
                }
                lx += this.colWidths[i];
            });

            this.y -= rowHeight;

            // Subtle line between rows
            this.currentPage.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.2, color: rgb(0.9, 0.9, 0.9) });
            this.y -= 5;
        });

        // Legend / Footer note
        this.y -= 10;
        this.drawText('Documento gerado pelo departamento logístico para acompanhamento do progresso das encomendas.', this.margin, 8, this.font, rgb(0.4, 0.4, 0.4));

        // Removed drawFooter from here, handled in multiPdf logic
    }

    drawAllFooters() {
        const totalPages = this.pages.length;
        this.pages.forEach((p, i) => {
            p.drawText(`Pág ${i + 1} / ${totalPages}`, {
                x: this.width - 80,
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

class FulfillmentExporter {
    async generatePdf(data) {
        const engine = new FulfillmentPdfEngine();
        await engine.init();
        engine.setProposalData(data);
        engine.process();
        engine.drawAllFooters();
        const bytes = await engine.getBytes();
        return Buffer.from(bytes);
    }

    async generateMultiPdf(proposalIds) {
        const engine = new FulfillmentPdfEngine();
        await engine.init();

        const service = require('./service'); // Require dynamically to avoid circular dep issues early on

        for (const [index, pid] of proposalIds.entries()) {
            const data = await service.getProposalFulfillmentDetails(pid);
            if (!data || data.error || !data.lines) continue;

            engine.setProposalData(data);
            engine.process();

            // Add a separator space between proposals if they end up on the same page
            // (Engine's process adds a new page by default, so each proposal starts on a new page)
        }

        engine.drawAllFooters();
        const bytes = await engine.getBytes();
        return Buffer.from(bytes);
    }
}

module.exports = new FulfillmentExporter();
