
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const xlsx = require('xlsx');
const {
    calculateProposalLineAmounts,
    isCommentLine,
    normalizeCommentStyle,
    normalizeStoredProposalLine
} = require('./lineUtils');

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

function hexToPdfColor(hex) {
    const raw = String(hex || '').trim();
    const normalized = /^#([0-9a-f]{6})$/i.test(raw) ? raw : '#CBD5E1';
    return rgb(
        parseInt(normalized.slice(1, 3), 16) / 255,
        parseInt(normalized.slice(3, 5), 16) / 255,
        parseInt(normalized.slice(5, 7), 16) / 255
    );
}

class ProposalPdfEngine {
    constructor(proposal, appLogoPath) {
        this.proposal = proposal;
        this.appLogoPath = appLogoPath;
        this.pdf = null;
        this.font = null;
        this.fontB = null;
        this.fontI = null;
        this.fontBI = null;
        this.logoImage = null;

        // Layout Config
        this.margin = 40;
        this.width = 595;
        this.height = 842;
        this.y = 0; // Current Y cursor
        this.currentPage = null;
        this.pages = [];

        // Table Config
        this.colWidths = [70, 35, 180, 40, 30, 65, 65];
        this.headers = ['Codigo', 'Qtd', 'Descricao', 'Obs', 'UN', 'P.Unit', 'Total'];
    }

    async init() {
        this.pdf = await PDFDocument.create();
        this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
        this.fontB = await this.pdf.embedFont(StandardFonts.HelveticaBold);
        this.fontI = await this.pdf.embedFont(StandardFonts.HelveticaOblique);
        this.fontBI = await this.pdf.embedFont(StandardFonts.HelveticaBoldOblique);

        if (this.appLogoPath && fs.existsSync(this.appLogoPath)) {
            const bytes = fs.readFileSync(this.appLogoPath);
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
        this.y = startY;
        const rightX = 350;

        this.currentPage.drawText('PROPOSTA', { x: rightX, y: this.y - 14, size: 14, font: this.fontB });
        this.y -= 24;

        this.currentPage.drawText('Nº Proposta:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });

        let rawNum = proposal.proposal_number || proposal.metadata?.doc_number || proposal.name || '';
        let displayNum = rawNum.replace(/Proposta Manual:\s*/i, '').replace(/Proposta:\s*/i, '').split('-')[0].trim();
        this.currentPage.drawText(displayNum || 'PROP-2026-XXX', { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('Cliente:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.client_ref || 'Consumidor Final'), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('NIF:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.client_vat || '999999999'), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y -= 14;

        this.currentPage.drawText('Contato:', { x: rightX, y: this.y - 10, size: 9, font: this.fontB });
        this.currentPage.drawText(safeText(proposal.metadata?.client_contact || ''), { x: rightX + 65, y: this.y - 10, size: 9, font: this.font });
        this.y = Math.min(this.y, startY - 110) - 20;

        // Project Row
        this.currentPage.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        this.y -= 15;

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

        this.currentPage.drawText('Data Doc:', { x: rightMetaX + 130, y: this.y - 9, size: 8, font: this.fontB });
        this.currentPage.drawText(new Date(proposal.updated_at).toLocaleDateString('pt-PT'), { x: rightMetaX + 130, y: this.y - 18, size: 8, font: this.font });

        if (proposal.order_confirmation_date) {
            this.currentPage.drawText('Conf. Fábrica:', { x: rightMetaX + 5, y: this.y - 9, size: 8, font: this.fontB });
            this.currentPage.drawText(new Date(proposal.order_confirmation_date).toLocaleDateString('pt-PT'), { x: rightMetaX + 5, y: this.y - 18, size: 8, font: this.font });
        }

        this.y -= 30;
    }

    drawContinuationHeader() {
        const cleanName = safeText(this.proposal.name).replace(/Proposta Manual:\s*/i, '').split('-')[0].trim();
        this.drawText('PROPOSTA (Continuação)', this.width - this.margin, 10, this.fontB, rgb(0.5, 0.5, 0.5), 'right');
        this.drawText(`Nº: ${cleanName}`, this.width - this.margin, 8, this.font, rgb(0.5, 0.5, 0.5), 'right');
        this.y -= 30;
    }

    drawFooter() {
        const footerY = this.margin + 40;
        this.currentPage.drawText('Pagamento por transferência bancária para o IBAN:', this.margin, footerY, { size: 8, font: this.fontB, color: rgb(0.4, 0.4, 0.4) });
        this.currentPage.drawText('BPI: PT50 0010 0000 5819 1020 0010 2', this.margin, footerY - 10, { size: 8, font: this.font, color: rgb(0.4, 0.4, 0.4) });

        if (this.packagingBreakdown) {
            this.currentPage.drawText(`Resumo Embalagem: ${this.packagingBreakdown}`, this.margin, footerY - 22, { size: 7, font: this.font, color: rgb(0.5, 0.5, 0.5) });
        }

        this.currentPage.drawText('Este documento não serve de fatura', {
            x: this.width - this.margin - 150,
            y: this.margin + 30,
            size: 8,
            font: this.font,
            color: rgb(0.5, 0.5, 0.5)
        });
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
        const footerSpace = 100;
        if (this.y - neededHeight < footerSpace) {
            this.drawFooter();
            this.addNewPage();
            this.drawTableHeaders();
        }
    }

    process() {
        let totalSiva = 0;

        this.proposal.lines.forEach(line => {
            const { lineNet } = calculateProposalLineAmounts(line);
            totalSiva += lineNet;
        });

        // Packaging Costs Calculation
        let packagingTotal = 0;
        const pkCosts = this.proposal.metadata?.packaging_costs || [];
        pkCosts.forEach(cost => {
            if (!cost.enabled) return;
            if (cost.type === 'fixed') {
                packagingTotal += parseFloat(cost.value || 0);
            } else {
                const shipping = parseFloat(this.proposal.metadata?.shipping_cost || 0);
                const baseVal = cost.base === 'liquid' ? totalSiva : (totalSiva + shipping);
                packagingTotal += baseVal * (parseFloat(cost.value || 0) / 100);
            }
        });

        this.packagingBreakdown = pkCosts
            .filter(c => c.enabled)
            .map(c => {
                const val = parseFloat(c.value || 0);
                const displayVal = c.type === 'fixed' ? `${val.toFixed(2)} €` : `${val}%`;
                return `${c.description}: ${displayVal}`;
            })
            .join('; ');

        this.addNewPage();
        this.drawTableHeaders();

        totalSiva = 0; // Reset for line processing

        this.proposal.lines.forEach(line => {
            const normalizedLine = normalizeStoredProposalLine(line);
            const qty = normalizedLine.quantity;
            const price = normalizedLine.unit_price_commercial;
            const isComment = isCommentLine(normalizedLine);

            if (isComment) {
                const commentStyle = normalizeCommentStyle(normalizedLine.extra_attributes?.comment_style);
                const commentFont = commentStyle.bold
                    ? (commentStyle.italic ? this.fontBI : this.fontB)
                    : (commentStyle.italic ? this.fontI : this.font);
                const commentSize = commentStyle.fontSize;
                const commentColor = hexToPdfColor(commentStyle.color);
                const fullDescription = (normalizedLine.description || ' ').replace(/\{.*?\}/g, '').trim() || ' ';
                const displayDescription = commentStyle.variant === 'title' || commentStyle.variant === 'subtitle'
                    ? fullDescription.toUpperCase()
                    : fullDescription;
                const descLines = this.splitTextToLines(displayDescription, commentSize, this.width - (this.margin * 2) - 10);
                const lineHeight = Math.max(12, commentSize + 2);
                const rHeight = Math.max(18, (descLines.length * lineHeight) + 8);

                this.checkSpace(rHeight);

                let dy = 0;
                descLines.forEach(dl => {
                    this.drawText(dl, this.margin + 5, commentSize, commentFont, commentColor);
                    dy += lineHeight;
                });

                this.y -= (rHeight + 5);
                return;
            }

            const { lineNet: lineTotal } = calculateProposalLineAmounts(normalizedLine);
            totalSiva += lineTotal;

            let fullDescription = (normalizedLine.description || '').replace(/\{.*?\}/g, '').trim();
            const extraLines = [];

            const effectiveLeadWeeks = normalizedLine.lead_time_weeks || this.proposal.general_lead_time_weeks || 0;
            let predictedDateDisplay = '';

            if (normalizedLine.predicted_ship_date) {
                const d = new Date(normalizedLine.predicted_ship_date);
                if (!isNaN(d.getTime())) {
                    predictedDateDisplay = d.toLocaleDateString('pt-PT');
                }
            }

            if (!predictedDateDisplay && effectiveLeadWeeks > 0) {
                const baseDate = this.proposal.order_confirmation_date
                    ? new Date(this.proposal.order_confirmation_date)
                    : (this.proposal.metadata?.doc_date ? new Date(this.proposal.metadata.doc_date) : null);

                if (baseDate && !isNaN(baseDate.getTime())) {
                    baseDate.setDate(baseDate.getDate() + (effectiveLeadWeeks * 7));
                    predictedDateDisplay = baseDate.toLocaleDateString('pt-PT');
                }
            }

            if (predictedDateDisplay) {
                extraLines.push(`PRAZO PREVISTO: ${predictedDateDisplay}`);
            }

            if (this.proposal.metadata?.show_technical_details) {
                const extra = normalizedLine.extra_attributes || {};
                const finishCode = extra.finish_code || extra.finishCode || extra.brand_meta?.finishCode;

                if (finishCode) extraLines.push(`Acabamento: ${finishCode}`);
                if (extra.original_description) extraLines.push(`Desc. Original: ${extra.original_description}`);
                if (extra.collection || extra.series) extraLines.push(`Serie: ${extra.collection || extra.series}`);
            }

            const mainDescLines = this.splitTextToLines(fullDescription, 9, this.colWidths[2] - 10);
            const detailLines = extraLines.flatMap(el => this.splitTextToLines(el, 7, this.colWidths[2] - 15));

            const rowHeight = Math.max(15, (mainDescLines.length * 10) + (detailLines.length * 8) + 10);

            this.checkSpace(rowHeight);

            const row = [
                normalizedLine.sku,
                String(normalizedLine.quantity),
                '',
                '',
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
                    this.y = topY;
                } else {
                    this.drawText(text, lx, 9, this.font, rgb(0, 0, 0));
                }
                lx += this.colWidths[i];
            });

            this.y -= (rowHeight + 5);
        });

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
        if (packagingTotal > 0) {
            drawTotalLine('Embalagem/Manuseamento', fmtEUR(packagingTotal));
        }
        
        const shipping = parseFloat(this.proposal.metadata?.shipping_cost || 0);
        if (shipping > 0) {
            drawTotalLine('Portes', fmtEUR(shipping));
        }

        const iva = (totalSiva + packagingTotal + shipping) * 0.23;
        drawTotalLine('IVA (23%)', fmtEUR(iva));

        this.y -= 5;
        this.currentPage.drawLine({ start: { x: totalsX, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.5 });
        this.y -= 5;
        drawTotalLine('Total (c/IVA)', fmtEUR(totalSiva + packagingTotal + shipping + iva), true);

        // Technical Annex
        if (this.proposal.metadata?.show_technical_details) {
            const uniqueFinishes = [];
            const finishCheck = new Set();
            this.proposal.lines.forEach(line => {
                const extra = typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes || '{}') : (line.extra_attributes || {});
                let note = extra.finish_note || extra.finishNote || extra.note_pt || extra.note || extra.brand_meta?.finishNote || extra.brand_meta?.note_pt;
                let code = extra.finish_code || extra.finishCode || extra.brand_meta?.finishCode || '';

                if (note) {
                    note = note.replace(/\{.*?\}/g, '').trim();
                }

                if (code === 'NEM' || code === 'BIM') {
                    code = `CL (${code})`;
                }

                const key = `${code}|${note}`;
                if (note && !finishCheck.has(key)) {
                    finishCheck.add(key);
                    uniqueFinishes.push({ code, note });
                }
            });

            if (uniqueFinishes.length > 0) {
                this.drawFooter();
                this.addNewPage();
                this.drawContinuationHeader();
                this.y -= 20;

                this.drawText('ANEXO: ESPECIFICAÇÕES TÉCNICAS DE ACABAMENTOS', this.margin, 12, this.fontB, rgb(0, 0, 0));
                this.y -= 25;

                // Sort by code length descending to handle sub-string filtering
                const sortedFinishes = [...uniqueFinishes].sort((a, b) => b.code.length - a.code.length);
                const filteredFinishes = [];

                sortedFinishes.forEach(f => {
                    const isRedundant = filteredFinishes.some(existing => {
                        const codeMatch = existing.code.includes(f.code) && f.code.length < existing.code.length;
                        const noteMatch = existing.note.includes(f.note) || f.note.includes(existing.note);
                        return codeMatch && noteMatch;
                    });
                    if (!isRedundant) filteredFinishes.push(f);
                });

                filteredFinishes.forEach(f => {
                    const title = f.code ? `Acabamento: ${f.code}` : 'Especificação Técnica';
                    const noteLines = this.splitTextToLines(f.note, 9, this.width - (this.margin * 2) - 20);
                    const blockHeight = (noteLines.length * 12) + 30;

                    if (this.y - blockHeight < 100) {
                        this.drawFooter();
                        this.addNewPage();
                        this.drawContinuationHeader();
                        this.y -= 20;
                    }

                    this.drawText(title, this.margin, 10, this.fontB, rgb(0.1, 0.1, 0.1));
                    this.y -= 14;
                    noteLines.forEach(ln => {
                        this.drawText(ln, this.margin + 5, 8.5, this.font, rgb(0.3, 0.3, 0.3));
                        this.y -= 11;
                    });
                    this.y -= 15;
                });
            }
        }

        this.drawFooter();

        const totalPages = this.pages.length;
        this.pages.forEach((p, i) => {
            p.drawText(`Pag ${i + 1} / ${totalPages}`, {
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

    async generateExcel(proposal) {
        const rows = proposal.lines.map(l => {
            const extra = l.extra_attributes || {};
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
        xlsx.utils.book_append_sheet(wb, ws, "Proposta");

        // Add Packaging Summary if exists
        const pkCosts = proposal.metadata?.packaging_costs || [];
        if (pkCosts.filter(c => c.enabled).length > 0) {
            const pkRows = pkCosts.filter(c => c.enabled).map(c => ({
                'Descrição': c.description,
                'Tipo': c.type === 'percent' ? 'Percentagem' : 'Fixo',
                'Valor': c.value,
                'Base': c.base || 'N/A'
            }));
            const wsPk = xlsx.utils.json_to_sheet(pkRows);
            xlsx.utils.book_append_sheet(wb, wsPk, "Custos de Embalagem");
        }

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

    async generateExcel(proposal) {
        const rows = (proposal.lines || []).map(l => {
            const line = normalizeStoredProposalLine(l);
            const extra = line.extra_attributes || {};
            const effectiveLeadWeeks = line.lead_time_weeks || proposal.general_lead_time_weeks || 0;
            let predictedDateDisplay = line.predicted_ship_date ? new Date(line.predicted_ship_date).toLocaleDateString('pt-PT') : '';
            const { lineNet } = calculateProposalLineAmounts(line);

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
                'Morada Faturacao': proposal.metadata?.billing_address || '',
                'Morada Entrega': proposal.metadata?.shipping_is_billing ? 'Igual a faturacao' : (proposal.metadata?.shipping_address || ''),
                'Tipo Linha': line.line_type === 'comment' ? 'Comentario' : 'Artigo',
                'Codigo': line.sku,
                'Descricao': line.description,
                'Colecao': extra.collection || extra.series || '',
                'Quantidade': line.line_type === 'comment' ? '' : line.quantity,
                'Previsao Entrega': predictedDateDisplay,
                'Preco Unitario': line.line_type === 'comment' ? '' : line.unit_price_commercial,
                'Desconto %': line.line_type === 'comment' ? '' : line.discount_commercial_percent,
                'Subtotal': line.line_type === 'comment' ? '' : lineNet
            };
        });

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, "Proposta");

        const pkCosts = proposal.metadata?.packaging_costs || [];
        if (pkCosts.filter(c => c.enabled).length > 0) {
            const pkRows = pkCosts.filter(c => c.enabled).map(c => ({
                'Descricao': c.description,
                'Tipo': c.type === 'percent' ? 'Percentagem' : 'Fixo',
                'Valor': c.value,
                'Base': c.base || 'N/A'
            }));
            const wsPk = xlsx.utils.json_to_sheet(pkRows);
            xlsx.utils.book_append_sheet(wb, wsPk, "Custos de Embalagem");
        }

        return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    async generateConsolidatedItemsExcel(proposals) {
        const flatRows = [];
        for (const p of proposals) {
            const lines = p.lines || [];
            lines.forEach(l => {
                const line = normalizeStoredProposalLine(l);
                const { totalWithVat } = calculateProposalLineAmounts(line);
                flatRows.push({
                    'Proposta': p.name || '',
                    'Estado': p.status || '',
                    'Marca': p.brand_id || '',
                    'Cliente': p.client_ref || '',
                    'Data': p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-PT') : '',
                    'Tipo Linha': line.line_type === 'comment' ? 'Comentario' : 'Artigo',
                    'SKU/Artigo': line.sku || '',
                    'Descricao': line.description || '',
                    'Quantidade': line.line_type === 'comment' ? '' : (line.quantity || 0),
                    'P.Unit Com.': line.line_type === 'comment' ? '' : (line.unit_price_commercial || 0),
                    'IVA %': line.line_type === 'comment' ? '' : (line.vat_rate || '23'),
                    'Total Item (c/IVA)': line.line_type === 'comment' ? '' : totalWithVat
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
