const { normalizeDate } = require('./normalize');

function parseMoneyEU(str) {
    if (!str) return null;
    const clean = str.replace(/\.(?=\d{3},)/g, '').replace(',', '.').replace(/[^-0-9.]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziInvoiceTable(text) {
    // --- INITIALIZATION ---
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        date: null,
        projectRef: null,
        shippingMarks: null, // Crucial Addition for V12
        orderRef: null,
        shipmentDetails: null,
        dates: { issued: null, due: null },
        totals: { subtotal: null, total: null },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            shipping: { name: null, address: null },
            supplier: { name: "NICOLAZZI s.p.a.", address: "Via Pietro Durio 119, 28010 ALZO DI PELLA (NO)" }
        },
        debug: { extractor: 'nicolazzi (V12.2 - Supplier Fix)' }
    };

    if (!text) return extracted;
    // const lines = text.split('\n'); // Original line
    // let inTableZone = false; // Original line
    // let lineBuffer = []; // Original line
    let customerBuffer = [];

    // --- DATE & MONEY REGEX ---
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;

    // --- PAGE-BASED EXTRACTION LOGIC ---
    // Split text by Form Feed (\f or \u000c) to treat each page separately
    const pages = text.split(/\f|\u000c/);

    // Global Accumulators
    let globalLineBuffer = [];

    pages.forEach((pageText, pageIndex) => {
        const pageLines = pageText.split('\n');
        let pageInTable = false;

        for (let i = 0; i < pageLines.length; i++) {
            const line = pageLines[i];
            const trimmed = line.trim();
            if (!trimmed) continue;

            // DDT Line Detection (Transport Document Reference)
            // Example: "DDT Nr. 003050 del 09/12/2025"
            // If found, add to docRefs and skip so it doesn't contaminate the first item description.
            if (trimmed.match(/^(DDT|D\.D\.T\.)/i)) {
                if (!extracted.docRefs) extracted.docRefs = [];
                // Extract only the number/date part or the whole line if needed, usually whole line is useful ref
                // Clean up a bit
                const ddtClean = trimmed.replace(/^(DDT|D\.D\.T\.)\s*(Nr\.|N\.)?\s*/i, '').trim();
                // Avoid duplicates
                if (!extracted.docRefs.includes(ddtClean)) {
                    extracted.docRefs.push(ddtClean);
                }
                continue; // Skip this line completely
            }

            // --- UNIFIED HEADER SKIP (All Pages identical) ---
            // Wait for Table Header ("Articolo...") to start extraction
            if (line.match(/^Articolo|^Descrizione/i) || (line.includes("Articolo") && line.includes("Col."))) {
                pageInTable = true;
                // Special handling for Customer Buffer only on Page 1
                if (pageIndex === 0 && customerBuffer.length > 0) {
                    extracted.entities.customer.name = customerBuffer[0];
                    if (customerBuffer.length > 1) {
                        extracted.entities.customer.address = customerBuffer.slice(1).join(", ");
                    }
                }
                continue; // Skip the header line itself
            }

            // --- 1. META DATA EXTRACTION (Only while NOT in Table) ---
            if (!pageInTable) {
                // Only extract metadata on Page 1 or if specifically needed
                if (pageIndex === 0) {
                    // DOC NUMBER & DATE
                    if (!extracted.docNumber || !extracted.dates.issued) {
                        const numDateMatch = line.match(/([0-9]+\/[A-Z])\s+(\d{2}\/\d{2}\/\d{4})/);
                        if (numDateMatch) {
                            extracted.docNumber = numDateMatch[1];
                            extracted.dates.issued = normalizeDate(numDateMatch[2]);
                            extracted.date = numDateMatch[2];
                        } else if (line.match(/^\d+\/[A-Z]$/) && !extracted.docNumber) {
                            extracted.docNumber = line.trim();
                        } else if (!extracted.dates.issued) {
                            const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
                            if (dateMatch && i < 20) {
                                const prev = pageLines[i - 1] || "";
                                if (prev.match(/Data|Date/i) || line.match(/Data|Date/i) || line.length < 40) {
                                    extracted.dates.issued = normalizeDate(dateMatch[1]);
                                    extracted.date = dateMatch[1];
                                }
                            }
                        }
                    }

                    // CUSTOMER
                    const customerPart = line.length > 100 ? line.substring(100).trim() : "";
                    const isStopWord = line.match(/Fattura|INVOICE|Numero|Data|Codice|Banca|Condizione|Payment|Annotazioni|riferimento|Shipping Marks/i);
                    const isVolumeLine = customerPart.match(/\d+,\d{2}\s+\d+/);
                    if (i < 25 && customerPart.length > 2 && !isStopWord && !isVolumeLine) {
                        const clean = customerPart.replace(/Spett\.le/gi, '').trim();
                        if (!clean.match(/Messrs|LIPARI|PORTO|FRANCO|DDT|Transport|Mezzo|Vettore|Causale|Aspetto|Pag\./i) && !clean.match(/^\s*\d{2}\/\d{2}\/\d{4}/)) {
                            customerBuffer.push(clean);
                        }
                    }

                    // PROJECT REF
                    if (line.match(/Vostro Riferimento|Your Ref/i)) {
                        const nextLine = pageLines[i + 1]?.trim();
                        if (nextLine) {
                            const candidate = nextLine.split(/\s{2,}/)[0];
                            if (candidate && !candidate.match(/PROJ\.$|P\.IVA|Cod\. Fisc\./) && candidate.length > 2) extracted.projectRef = candidate;
                        }
                    }
                    if (line.includes("PROJ.") && !extracted.projectRef) {
                        extracted.projectRef = line.substring(line.indexOf("PROJ.")).trim();
                    }

                    // SHIPPING MARKS
                    if (line.match(/Shipping Marks/i)) {
                        const markRegex = /(\d{2}\/\d{3,})/;
                        let val = line.split(/Shipping Marks/i)[1]?.match(markRegex)?.[0];
                        if (!val) {
                            for (let k = 1; k <= 3; k++) {
                                const nextL = pageLines[i + k];
                                if (!nextL) continue;
                                const m = nextL.match(markRegex);
                                if (m) { val = m[0]; break; }
                                if (nextL.match(/Volume|Colli/i)) {
                                    const prevL = pageLines[i + k - 1];
                                    if (prevL && !prevL.match(/Shipping Marks/i) && prevL.trim().length > 3) val = prevL.trim();
                                }
                            }
                        }
                        if (val) extracted.shippingMarks = val;
                    }
                }
                continue; // Continue Meta Loop
            }

            // --- 2. TABLE CONTENT ZONE (Per Page) ---
            if (pageInTable) {
                // A. STOP WORDS (Footer Detection - Page Break or Final)
                if (trimmed.match(/In relazione al presente|vigenti disposizioni|esponibilità|veridicità|prezzi ivi indicati|corrispondenti di massima/i)) {
                    // Stop processing this page immediately. Legal text marks end of items.
                    // Important: Flush buffer if pending? Usually legal text is NOT item description.
                    // So we discard buffer.
                    globalLineBuffer = [];
                    break; // Exit Page Loop
                }
                if (trimmed.match(/^Trasporto|^Spese incasso|^Totale imponibile|^IVA|^Totale imposta|^Totale netto merce|^Sconto di pagamento/i)) {
                    // Footer start. Stop page processing.
                    break;
                }

                // B. BLACKLIST (Header/Footer Noise Check - Safety Net)
                if (trimmed.match(/^Pag\.|^Numero\/ Number|^Fattura|^INVOICE/i) || trimmed.includes("NICOLAZZI") || trimmed.includes("Privacy information")) {
                    continue;
                }

                // C. FINANCIAL ROW DETECTION
                const moneyPattern = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
                const isFinRow = line.includes("EUR") && line.match(new RegExp(moneyPattern));

                if (isFinRow) {
                    const allRows = [...globalLineBuffer, line];
                    globalLineBuffer = []; // Flush

                    let code = "", description = "", ordRef = "", qty = 0, unitPrice = 0, total = 0;

                    // Parse Financials
                    const moneyMatches = line.match(new RegExp(moneyPattern, 'g'));
                    if (moneyMatches && moneyMatches.length >= 2) {
                        unitPrice = parseMoneyEU(moneyMatches[moneyMatches.length - 2]);
                        total = parseMoneyEU(moneyMatches[moneyMatches.length - 1]);
                    }
                    const qM = line.match(/\s+(\d+)\s+(?:EUR|NR|PZ)/);
                    if (qM) qty = parseInt(qM[1]);

                    // Parse Content
                    allRows.forEach(row => {
                        // Double safety filter against headers inside buffer
                        // Fixed Coordinates Logic (Poppler Layout)
                        const cPart = row.substring(0, 30).trim();
                        const dPart = row.substring(30, 89).trim();
                        const rPart = row.substring(89, 128).trim();

                        if (cPart && !code && !cPart.includes("DDT")) code = cPart;
                        if (dPart) description += " " + dPart;
                        if (rPart && !rPart.match(/^(NR|PZ|CF)$/)) ordRef += (ordRef ? " " : "") + rPart;
                    });

                    if (code || total > 0) {
                        // Clean Order Ref (Remove NR/PZ suffix)
                        let cleanedRef = ordRef ? ordRef.replace(/\s*(?:NR|PZ|CF)[\.\s]*$/i, '').trim() : null;

                        extracted.lines.push({
                            code: code || "SKU_PENDING",
                            description: description.trim(),
                            projectRef: cleanedRef,
                            uom: "NR",
                            quantity: qty || 1,
                            unitPrice: unitPrice,
                            total: total
                        });
                    }
                } else {
                    // Buffer Logic
                    // Push to buffer ONLY if it looks like content
                    globalLineBuffer.push(line);
                }
            }
        }
        // End of Page Loop - Clear Buffer to prevent cross-page contamination
        // (Any description pending at end of page usually belongs to item on prev page? 
        // No, Nicolazzi usually keeps items on same page or repeats header. 
        // Safer to clear buffer to avoid "Fattura" becoming description)
        globalLineBuffer = [];
    });

    // --- 3. TOTALS & FINALIZATION ---
    // (Keep existing totals logic from extracted.lines)
    const subtotalMatch = text.match(/Totale netto merce[\s\S]{1,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (subtotalMatch) extracted.totals.subtotal = parseMoneyEU(subtotalMatch[1]);

    const grossTotalMatch = text.match(/Totale\s+EUR[\s\S]{1,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i) ||
        text.match(/Totale da pagare[\s\S]{1,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i) ||
        text.match(/Totale\s*(?:\d{1,3}(?:\.\d{3})*,\d{2})?[\s\S]{1,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);

    if (grossTotalMatch) {
        extracted.totals.total = parseMoneyEU(grossTotalMatch[1]);
    } else if (extracted.lines.length > 0) {
        extracted.totals.total = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
    }

    // Normalization
    const subVal = extracted.totals.subtotal || extracted.lines.reduce((s, l) => s + (l.total || 0), 0);
    const grossVal = extracted.totals.total || subVal;
    extracted.totals.net = parseFloat(subVal || 0).toFixed(2);
    extracted.totals.gross = parseFloat(grossVal || 0).toFixed(2);

    return extracted;
}

module.exports = extractNicolazziInvoiceTable;
