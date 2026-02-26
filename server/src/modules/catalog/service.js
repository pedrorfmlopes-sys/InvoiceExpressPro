// server/src/modules/catalog/service.js
const XLSX = require('xlsx');
const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class CatalogService {

    /**
     * Inspects an Excel file and returns sheet names and their headers.
     */
    async inspectSheets(filePath) {
        const workbook = XLSX.readFile(filePath);
        const result = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            // Get headers from first row (range A1:Z1 approx)
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' });
            const headers = json.length > 0 ? json[0] : [];
            result.push({
                name: sheetName,
                headers: headers.map(h => String(h).trim()).filter(h => h.length > 0)
            });
        }
        return result;
    }


    async upsertFinishes(brand, data) {
        const rows = data.map(row => ({
            brand,
            finish_code: String(row.finish_code || row["Código Acabamento"] || row["Finish Code"] || '').trim(),
            group_code: String(row.group_code || row["Código Grupo"] || row["Group Code"] || '').trim(),
            name_it: row.name_it || row["Nome IT"],
            name_en: row.name_en || row["Nome EN"],
            note_pt: row.note_pt || row.nota_pt_pt || row["Nota PT"] || row["Explicação Técnica"] || row["Nota Técnica"],
            technical_type: row.technical_type || row["Tipo Técnico"],
            protection: row.protection || row["Proteção"]
        })).filter(r => r.finish_code && r.group_code);

        for (const row of rows) {
            // Check if exists
            const existing = await knex('catalog_finishes')
                .where({ brand, finish_code: row.finish_code })
                .first();

            if (existing) {
                await knex('catalog_finishes')
                    .where({ id: existing.id })
                    .update({ ...row, created_at: undefined });
            } else {
                await knex('catalog_finishes').insert({ ...row, id: uuidv4() });
            }
        }
    }
    async getUniqueCollections(filePath, sheetName, columnName) {
        if (!filePath || !sheetName || !columnName) {
            throw new Error('Missing parameters for collection inspection');
        }
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const collections = new Set();

        data.forEach(row => {
            // Trim keys in row if needed
            const val = row[columnName] || row[columnName.trim()];
            if (val) collections.add(String(val).trim());
        });

        return Array.from(collections).sort();
    }

    async processNicolazziExcel(filePath, mappings = {}) {
        const workbook = XLSX.readFile(filePath);
        const brand = 'nicolazzi';

        // DEFAULT MAPPINGS (Fallback)
        const cols = mappings.columns || {
            sku: 'Codigo',
            description_pt: 'Des.PT',
            price: 'PVP',
            collection: 'Série'
        };

        const allowedCollections = mappings.allowedCollections || null; // Whitelist

        // 1. Process Finishes (Acabamentos) - Do this BEFORE items so they can be linked if needed
        const fSheetName = mappings.finishSheetName || "Acabamentos";
        const finishSheet = workbook.Sheets[fSheetName];
        if (finishSheet) {
            console.log(`[CatalogService] Processing finishes from sheet "${fSheetName}"`);
            const finishData = XLSX.utils.sheet_to_json(finishSheet);
            await this.upsertFinishes(brand, finishData);
        }

        const sheetName = mappings.itemSheetName || workbook.SheetNames.find(s => s.toLowerCase().includes('tabela')) || workbook.SheetNames[0];

        if (!sheetName || !workbook.Sheets[sheetName]) {
            throw new Error(`Sheet not found: ${sheetName}`);
        }

        // CLEAR DATA IF REQUESTED
        if (mappings.clearBeforeImport) {
            console.log(`[CatalogService] Clearing all current items for brand: ${brand}`);
            await knex('catalog_items').where({ brand }).delete();
        }

        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        // Sanitize keys (trim spaces) to match inspectSheets/UI logic
        const data = rawData.map(row => {
            const newRow = {};
            Object.keys(row).forEach(key => {
                newRow[key.trim()] = row[key];
            });
            return newRow;
        });

        console.log(`[CatalogService] Processing ${data.length} items from sheet "${sheetName}"`);
        console.log(`[CatalogService] Mapping used:`, cols);
        if (allowedCollections) {
            console.log(`[CatalogService] Collection Filter Active:`, allowedCollections);
        }

        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let filteredCount = 0;

        // 1. Load all existing SKUs for this brand into a Map for O(1) lookup
        console.log(`[CatalogService] Loading existing items for brand "${brand}" into memory...`);
        const existingItems = await knex('catalog_items')
            .where({ brand })
            .select('id', 'sku', 'handle', 'finish_group');

        const existingMap = new Map();
        existingItems.forEach(item => {
            const key = `${item.sku.toLowerCase()}|${(item.handle || '').toLowerCase()}|${(item.finish_group || '').toLowerCase()}`;
            existingMap.set(key, item.id);
        });

        const toInsert = [];
        const toUpdate = [];

        // 2. Prepare items in memory
        for (const row of data) {
            const sku = String(row[cols.sku] || row.Codigo || '').trim();
            if (!sku) {
                skippedCount++;
                continue;
            }

            const series = String(row[cols.collection] || row.Serie || '').trim();

            // COLLECTION FILTER
            if (allowedCollections && !allowedCollections.includes(series)) {
                filteredCount++;
                continue;
            }

            const handle = String(row.Manipulo || '').trim();
            const finish_group = String(row.Acabamentos || '').trim();

            const itemData = {
                brand,
                sku,
                handle,
                finish_group,
                description_it: row["Des.IT"],
                description_pt: row[cols.description_pt] || row["Des.PT"],
                price: parseFloat(row[cols.price] || row.PVP || 0),
                series,
                updated_at: new Date()
            };

            const key = `${sku.toLowerCase()}|${handle.toLowerCase()}|${finish_group.toLowerCase()}`;
            const existingId = existingMap.get(key);

            if (existingId) {
                toUpdate.push({ id: existingId, ...itemData });
            } else {
                toInsert.push({ ...itemData, id: uuidv4() });
            }
        }

        // 3. Perform Batch Execution
        console.log(`[CatalogService] Executing batches: ${toInsert.length} inserts, ${toUpdate.length} updates`);

        // Batch Inserts are very fast
        if (toInsert.length > 0) {
            const CHUNK_SIZE = 500;
            for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
                await knex('catalog_items').insert(toInsert.slice(i, i + CHUNK_SIZE));
                createdCount += toInsert.slice(i, i + CHUNK_SIZE).length;
            }
        }

        // Updates are trickier because they need unique WHERE clauses. 
        // We use a transaction for groups of updates to reduce I/O.
        if (toUpdate.length > 0) {
            const UPDATE_CHUNK = 200;
            for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
                const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
                await knex.transaction(async trx => {
                    for (const item of chunk) {
                        const { id, ...data } = item;
                        await trx('catalog_items').where({ id }).update(data);
                    }
                });
                updatedCount += chunk.length;
            }
        }

        console.log(`[CatalogService] Import finished. Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Filtered: ${filteredCount}`);
        return { success: true, stats: { createdCount, updatedCount, skippedCount, filteredCount } };
    }

    async processRitmonioExcel(filePath, mappings = {}) {
        const workbook = XLSX.readFile(filePath);
        const brand = 'ritmonio';

        const cols = mappings.columns || {
            sku: 'Codart',
            description_pt: 'Des_1_PT',
            price: 'PL39',
            collection: 'Familia',
            // Finish columns (optional)
            fCode: 'Codigo',
            fName: 'Nome_EN',
            fDays: 'Tempo produção',
            fStar: 'Marcado asterisco',
            fDesc: 'Descricao Tecnica'
        };

        const allowedCollections = mappings.allowedCollections || null;

        // 1. Process Finishes (Sheet: Acabamentos)
        const fSheetName = mappings.finishSheetName || "Acabamentos";
        const finishSheet = workbook.Sheets[fSheetName];
        if (finishSheet) {
            console.log(`[CatalogService] Ritmonio: Processing finishes from "${fSheetName}"`);
            const rawFinishData = XLSX.utils.sheet_to_json(finishSheet, { defval: '' });

            const finishes = rawFinishData.map(row => {
                // Sanitize keys
                const r = {}; Object.keys(row).forEach(k => r[k.trim()] = row[k]);

                const code = String(r[cols.fCode] || r['Codigo'] || '').trim();
                if (!code) return null;

                const name = String(r[cols.fName] || r['Nome_EN'] || '').trim();
                const leadDays = parseInt(r[cols.fDays] || r['Tempo produção']) || 0;
                const starVal = String(r[cols.fStar] || r['Marcado asterisco'] || '').toLowerCase();
                const isStarred = starVal === 'sim' || starVal === 'true' || starVal === '1' || starVal === 'x';
                const techDesc = String(r[cols.fDesc] || r['Descricao Tecnica'] || '').trim();

                const leadWeeks = Math.ceil(leadDays / 5);

                return {
                    brand: 'ritmonio',
                    finish_code: code,
                    group_code: isStarred ? 'STARRED' : 'STANDARD',
                    name_en: name, // Maintain Nicolazzi parity
                    description_pt: techDesc || null,
                    note_pt: JSON.stringify({ lead_time_days: leadDays, lead_time_weeks: leadWeeks }),
                    updated_at: new Date()
                };
            }).filter(Boolean);

            for (const f of finishes) {
                const existing = await knex('catalog_finishes').where({ brand: 'ritmonio', finish_code: f.finish_code }).first();
                if (existing) {
                    await knex('catalog_finishes').where({ id: existing.id }).update(f);
                } else {
                    await knex('catalog_finishes').insert({ ...f, id: uuidv4(), created_at: new Date() });
                }
            }
        }

        // 2. Process Items
        const iSheetName = mappings.itemSheetName || workbook.SheetNames.find(s => s.toLowerCase().includes('compacta')) || workbook.SheetNames[0];
        const itemSheet = workbook.Sheets[iSheetName];
        if (!itemSheet) throw new Error(`Sheet not found: ${iSheetName}`);

        if (mappings.clearBeforeImport) {
            await knex('catalog_items').where({ brand: 'ritmonio' }).delete();
        }

        const rawItemData = XLSX.utils.sheet_to_json(itemSheet, { defval: '' });
        const items = rawItemData.map(row => {
            const r = {}; Object.keys(row).forEach(k => r[k.trim()] = row[k]);

            const sku = String(r[cols.sku] || r['Codart'] || '').trim();
            if (!sku) return null;

            const series = String(r[cols.collection] || r['Familia'] || '').trim();
            if (allowedCollections && !allowedCollections.includes(series)) return null;

            // Ritmonio specific description cleaning (merging Des_1 and Des_2 if they exist)
            let desc = String(r[cols.description_pt] || r['Des_1_PT'] || '').trim();
            const desc2 = String(r['Des_2_PT'] || '').trim();
            if (desc2) desc += ' ' + desc2;
            desc = desc.replace(/\s+_/g, ' ').replace(/\s{2,}/g, ' ').trim();

            return {
                brand: 'ritmonio',
                sku,
                series,
                description_pt: desc,
                price: parseFloat(r[cols.price] || r['PL39'] || 0),
                updated_at: new Date(),
                source: 'Import Automatic'
            };
        }).filter(Boolean);

        // Batch processing for items
        let createdCount = 0;
        let updatedCount = 0;

        // Load existing map
        const existingItems = await knex('catalog_items').where({ brand: 'ritmonio' }).select('id', 'sku');
        const existingMap = new Map();
        existingItems.forEach(it => existingMap.set(it.sku.toLowerCase(), it.id));

        const toInsert = [];
        const toUpdate = [];

        for (const it of items) {
            const eid = existingMap.get(it.sku.toLowerCase());
            if (eid) toUpdate.push({ id: eid, ...it });
            else toInsert.push({ ...it, id: uuidv4(), created_at: new Date() });
        }

        if (toInsert.length > 0) {
            const chunk = 500;
            for (let i = 0; i < toInsert.length; i += chunk) {
                await knex('catalog_items').insert(toInsert.slice(i, i + chunk));
                createdCount += toInsert.slice(i, i + chunk).length;
            }
        }

        if (toUpdate.length > 0) {
            const chunk = 100;
            for (let i = 0; i < toUpdate.length; i += chunk) {
                await knex.transaction(async trx => {
                    for (const row of toUpdate.slice(i, i + chunk)) {
                        const { id, ...data } = row;
                        await trx('catalog_items').where({ id }).update(data);
                    }
                });
                updatedCount += toUpdate.slice(i, i + chunk).length;
            }
        }

        return { success: true, stats: { createdCount, updatedCount, skippedCount: rawItemData.length - items.length } };
    }

    // The original upsertItems method is now largely redundant as its logic is integrated into processNicolazziExcel.
    // However, to maintain the structure and avoid breaking other potential calls,
    // I'm keeping it but noting its reduced role or potential for removal.
    // If processNicolazziExcel is the only caller, this method can be removed.
    async upsertItems(brand, data) {
        // We handle it in chunks to avoid blocking too long if the file is huge
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await knex.transaction(async trx => {
                // DEBUG: Log headers of first row
                if (i === 0 && chunk.length > 0) {
                    console.log('DEBUG: Excel Row Keys:', Object.keys(chunk[0]));
                    console.log('DEBUG: First Row Sample:', chunk[0]);
                }

                for (const row of chunk) {
                    const item = {
                        brand,
                        sku: String(row["Codigo "] || row.Codigo || '').trim(),
                        handle: String(row.Manipulo || '').trim(),
                        finish_group: String(row.Acabamentos || '').trim(),
                        description_it: row["Des.IT"],
                        description_en: row["Des.ENG"],
                        description_pt: row["Des.PT"],
                        price: parseFloat(row.PVP || 0),
                        price_prev: parseFloat(row.PVP_2025 || 0),
                        series: String(row.Serie || row.Série || '').trim(),
                        source: 'official'
                    };

                    if (!item.sku) continue;

                    const existing = await trx('catalog_items')
                        .where({
                            brand,
                            sku: item.sku,
                            handle: item.handle,
                            finish_group: item.finish_group,
                            source: 'official'
                        })
                        .first();

                    if (existing) {
                        await trx('catalog_items')
                            .where({ id: existing.id })
                            .update({ ...item, updated_at: knex.fn.now() });
                    } else {
                        await trx('catalog_items').insert({ ...item, id: uuidv4() });
                    }
                }
            });
        }
    }

    async searchItems(brand, query) {
        let q = knex('catalog_items');

        // Se a brand não for "TODAS", filtramos especificamente por uma marca.
        if (brand && brand.toUpperCase() !== 'TODAS') {
            q = q.where('brand', 'LIKE', `%${brand}%`);
        }

        if (query) {
            const qLower = query.trim().toLowerCase();
            const terms = qLower.split(/\s+/);

            if (terms.length > 1) {
                // Multi-term: First term for SKU, others for handle or description
                const firstTerm = terms[0];
                const otherTerms = terms.slice(1);

                q = q.andWhereRaw('LOWER(sku) LIKE ?', [`%${firstTerm}%`]);

                for (const term of otherTerms) {
                    if (!term) continue;
                    q = q.andWhere(function () {
                        this.whereRaw('LOWER(handle) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(description_pt) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(description_it) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(finish_group) LIKE ?', [`%${term}%`]);
                    });
                }
            } else {
                // Single term: Match SKU, handle or description
                q = q.andWhere(function () {
                    this.whereRaw('LOWER(sku) LIKE ?', [`%${qLower}%`])
                        .orWhereRaw('LOWER(handle) LIKE ?', [`%${qLower}%`])
                        .orWhereRaw('LOWER(description_pt) LIKE ?', [`%${qLower}%`])
                        .orWhereRaw('LOWER(description_it) LIKE ?', [`%${qLower}%`]);
                });
            }
        }

        return q.limit(50).orderBy('sku', 'asc');
    }

    /**
     * Resolves a raw SKU (e.g., 1002-28-CR) to a catalog item and its finish notes.
     */
    async resolveItem(brand, rawSku) {
        if (!brand) return { error: 'Brand required' };
        const b = brand.toLowerCase();

        if (b === 'nicolazzi') {
            return this.resolveNicolazziSku(rawSku);
        }

        const cleanSku = String(rawSku || '').trim();

        if (b === 'multimarcas' || b === 'todas' || b === 'other') {
            // Smart resolution logic for Multi-Brand Proposals

            // Try generic EXACT match across all brands first
            const genericItem = await knex('catalog_items')
                .where({ sku: cleanSku })
                .first();

            if (genericItem) {
                // Found an exact match! Re-run using the proper brand to extract lead times and finish info correctly
                return this.resolveItem(genericItem.brand, rawSku);
            }

            // If exact match failed, try Nicolazzi Fuzzy Match matcher (split finishes and handles)
            const nicoRes = await this.resolveNicolazziSku(rawSku);
            if (nicoRes.success) {
                return nicoRes;
            }

            // Both failed
            return { success: false, reason: 'Not found in any catalog' };
        }

        // Generic / Single-brand resolution
        try {
            const item = await knex('catalog_items')
                .whereRaw('LOWER(brand) = ?', [b])
                .andWhere({ sku: cleanSku })
                .first();

            if (!item) return { success: false, reason: 'Not found in generic catalog' };

            // For Ritmonio, try to match the last 2-4 chars to a finish code to get lead time and details
            let leadTimeWeeks = null;
            let finishNote = item.description_pt;
            let finish = null;
            let finishCode = item.finish_group || '';

            if (b === 'ritmonio') {
                const finishMap = await knex('catalog_finishes').where({ brand: 'ritmonio' });
                const upperSku = cleanSku.toUpperCase();

                for (const f of finishMap) {
                    if (upperSku.endsWith(f.finish_code.toUpperCase())) {
                        finish = f;
                        finishCode = f.finish_code;
                        try {
                            const params = typeof f.note_pt === 'string' ? JSON.parse(f.note_pt) : (f.note_pt || {});
                            leadTimeWeeks = params.lead_time_weeks || null;
                            // Technical description from finish takes priority for the note
                            const techDesc = f.description_pt || '';
                            const timeStr = params.lead_time_days ? ` | Produção: ${params.lead_time_days} dias úteis` : '';
                            finishNote = techDesc ? `${techDesc}${timeStr}` : `${item.description_pt}${timeStr}`;
                        } catch (e) {
                            console.warn('[CatalogService] Failed to parse finish note for Ritmonio:', f.finish_code);
                        }
                        break;
                    }
                }
            }

            return {
                success: true,
                sku: item.sku,
                brand: item.brand,
                description_pt: item.description_pt,
                finishCode: finishCode,
                finishNote: finishNote,
                leadTimeWeeks: leadTimeWeeks,
                finish: finish,
                item: item
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async resolveBulk(brand, skus) {
        if (!Array.isArray(skus)) return [];
        const results = [];
        for (const sku of skus) {
            const res = await this.resolveItem(brand, sku);
            results.push(res);
        }
        return results;
    }

    async resolveNicolazziSku(rawSku) {
        try {
            const cleanSku = String(rawSku || '').trim();
            if (!cleanSku) return { success: false };

            console.log(`[CatalogService] Resolving Nicolazzi SKU: "${cleanSku}"`);

            // Helper to perform the tiered lookup once we have candidates
            const attemptMatch = async (sku, handle, finishCode) => {
                if (!sku || sku.length < 2) return null;

                let finish = null;
                if (finishCode) {
                    finish = await knex('catalog_finishes').where({ brand: 'nicolazzi', finish_code: finishCode }).first();
                }
                const groupCode = finish ? finish.group_code : null;

                // 1. Exact Match (SKU + Handle + Group)
                let item = await this.findItem('nicolazzi', sku, handle, groupCode);

                // 2. Fuzzy Match (SKU + Handle, ignore group)
                if (!item && handle) {
                    item = await knex('catalog_items')
                        .where({ brand: 'nicolazzi', sku: sku.trim(), handle: handle.trim() })
                        .first();
                }

                if (item) {
                    return { item, finish, finishCode, success: true, fuzzy: !finish || item.finish_group !== groupCode };
                }
                return null;
            };

            // STRATEGY 1: Split by separators (Standard)
            const parts = cleanSku.split(/[- /.]+/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                // Try [Base, Handle, Finish]
                if (parts.length >= 3) {
                    const res = await attemptMatch(parts[0], parts[1], parts[2]);
                    if (res) return { ...res, originalSku: rawSku, sku: parts[0], handle: parts[1], series: res.item.series };
                }
                // Try [Base, Finish]
                const res2 = await attemptMatch(parts.slice(0, -1).join(''), '', parts[parts.length - 1]);
                if (res2) return { ...res2, originalSku: rawSku, sku: parts.slice(0, -1).join(''), handle: '', series: res2.item.series };
            }

            // STRATEGY 2: Puzzle (Combined strings)
            // We try different slices for Handle (digits) and Finish (letters)

            // Pattern 1: Base + Finish + Handle (e.g. 2233EXTNL27)
            for (const hLen of [3, 2]) {
                if (cleanSku.length <= hLen) continue;
                const handle = cleanSku.slice(-hLen);
                if (!/^\d+$/.test(handle)) continue;

                const rest = cleanSku.slice(0, -hLen);
                for (const fLen of [3, 2]) {
                    if (rest.length < fLen) continue;
                    const fCode = rest.slice(-fLen);
                    if (fCode.length < 2 || !/^[A-Z]+$/i.test(fCode)) continue;

                    const base = rest.slice(0, -fLen);
                    const res = await attemptMatch(base, handle, fCode);
                    if (res) return { ...res, originalSku: rawSku, sku: base, handle, series: res.item.series };
                }
                // Try Base (no finish) + Handle
                const resBase = await attemptMatch(rest, handle, '');
                if (resBase) return { ...resBase, originalSku: rawSku, sku: rest, handle, series: resBase.item.series };
            }

            // Pattern 2: Base + Handle + Finish (e.g. 100216CR)
            for (const fLen of [3, 2]) {
                if (cleanSku.length <= fLen) continue;
                const fCode = cleanSku.slice(-fLen);
                if (fCode.length < 2 || !/^[A-Z]+$/i.test(fCode)) continue;

                const rest = cleanSku.slice(0, -fLen);
                for (const hLen of [3, 2]) {
                    if (rest.length < hLen) continue;
                    const handle = rest.slice(-hLen);
                    if (!/^\d+$/.test(handle)) continue;

                    const base = rest.slice(0, -hLen);
                    const res = await attemptMatch(base, handle, fCode);
                    if (res) return { ...res, originalSku: rawSku, sku: base, handle, series: res.item.series };
                }
                // Try Base (no handle) + Finish
                const resNoHandle = await attemptMatch(rest, '', fCode);
                if (resNoHandle) return { ...resNoHandle, originalSku: rawSku, sku: rest, handle: '', series: resNoHandle.item.series };
            }

            // LAST RESORT: Try to find ANY item where the cleanSku starts with the item's SKU
            const potentialItems = await knex('catalog_items')
                .where('brand', 'nicolazzi')
                .whereRaw('? LIKE CONCAT(sku, \'%\')', [cleanSku])
                .orderByRaw('LENGTH(sku) DESC')
                .limit(10);

            for (const item of potentialItems) {
                const remainder = cleanSku.slice(item.sku.length);
                // Try to see if remainder contains handle or finish
                if (!remainder) return { originalSku: rawSku, item, sku: item.sku, handle: item.handle, success: true, fuzzy: true, series: item.series };

                // Guess finish from remainder
                const possibleFinish = await knex('catalog_finishes')
                    .where({ brand: 'nicolazzi' })
                    .whereRaw('? LIKE CONCAT(\'%\', finish_code, \'%\')', [remainder])
                    .first();

                return {
                    originalSku: rawSku,
                    sku: item.sku,
                    handle: item.handle,
                    finishCode: possibleFinish ? possibleFinish.finish_code : '',
                    finish: possibleFinish,
                    item,
                    success: true,
                    fuzzy: true,
                    series: item.series
                };
            }

            return { originalSku: rawSku, success: false };
        } catch (error) {
            console.error(`[CatalogService] Error resolving SKU ${rawSku}:`, error);
            return { originalSku: rawSku, success: false, error: error.message };
        }
    }

    async findItem(brand, sku, handle, groupCode) {
        let q = knex('catalog_items').where({ brand, sku: sku.trim() });
        if (handle) q = q.andWhere({ handle: handle.trim() });
        if (groupCode) q = q.andWhere({ finish_group: groupCode.trim() });
        return q.first();
    }

    async getStats() {
        const stats = await knex('catalog_items')
            .select('brand')
            .count('id as count')
            .max('updated_at as lastUpdate')
            .groupBy('brand');

        return stats;
    }

    async getBrandFinishes(brand) {
        if (!brand) return [];
        return await knex('catalog_finishes')
            .where('brand', brand)
            .orderBy('group_code', 'asc')
            .orderBy('finish_code', 'asc');
    }

    async clearBrandCatalog(brand) {
        if (!brand) throw new Error('Brand is required for cleanup');
        console.log(`[CatalogService] Explicit cleanup requested for brand: ${brand}`);

        await knex.transaction(async trx => {
            await trx('catalog_items').where({ brand }).delete();
            await trx('catalog_finishes').where({ brand }).delete();
        });

        return { success: true, message: `Catálogo de ${brand} limpo com sucesso.` };
    }

    /**
     * Creates new catalog items for multiple finish groups at once.
     * @param {string} brand 
     * @param {object} baseData { sku, handle, description_pt, series }
     * @param {array} priceMappings [{ group: 'G1', price: 100 }, { group: 'G2', price: 120 }]
     */
    async bulkCreateItems(brand, baseData, priceMappings) {
        if (!brand || !baseData.sku || !priceMappings || !priceMappings.length) {
            throw new Error('Invalid input for bulk creation');
        }

        const itemsToCreate = [];
        const timestamp = new Date();

        for (const mapping of priceMappings) {
            if (!mapping.group || mapping.price === undefined) continue;

            const item = {
                id: uuidv4(),
                brand,
                sku: baseData.sku.trim(),
                handle: (baseData.handle || '').trim(),
                finish_group: mapping.group.trim(),
                description_pt: baseData.description_pt.trim(),
                series: (baseData.series || '').trim(),
                price: parseFloat(mapping.price),
                source: 'manual_entry',
                updated_at: timestamp
            };
            itemsToCreate.push(item);
        }

        if (itemsToCreate.length === 0) {
            return { success: false, message: 'No valid items to create' };
        }

        await knex.transaction(async trx => {
            for (const item of itemsToCreate) {
                // Check for existing item to update or insert
                const existing = await trx('catalog_items')
                    .where({
                        brand,
                        sku: item.sku,
                        handle: item.handle,
                        finish_group: item.finish_group
                    })
                    .first();

                if (existing) {
                    await trx('catalog_items')
                        .where({ id: existing.id })
                        .update({
                            description_pt: item.description_pt,
                            series: item.series,
                            price: item.price,
                            source: 'manual_entry',
                            updated_at: timestamp
                        });
                } else {
                    await trx('catalog_items').insert(item);
                }
            }
        });

        return { success: true, count: itemsToCreate.length };
    }

    async getStoredCollections(brand) {
        // Sync first to ensure table is populated
        await this.syncCollections(brand);

        return await knex('catalog_collections')
            .where({ brand })
            .orderBy('name', 'asc');
    }

    async syncCollections(brand) {
        // 1. Get all unique series from items
        const distinctSeries = await knex('catalog_items')
            .distinct('series')
            .where({ brand })
            .whereNotNull('series')
            .whereNot('series', '');

        const currentSeries = distinctSeries.map(r => r.series);

        // 2. Insert missing ones into catalog_collections
        // We use INSERT IGNORE logic (or onConflict ignore)
        if (currentSeries.length > 0) {
            const inserts = currentSeries.map(name => ({
                brand,
                name,
                is_visible: true // Default visible
            }));

            await knex('catalog_collections')
                .insert(inserts)
                .onConflict(['brand', 'name'])
                .ignore();
        }
    }

    async toggleCollectionVisibility(brand, name, isVisible) {
        await knex('catalog_collections')
            .where({ brand, name })
            .update({ is_visible: isVisible, updated_at: new Date() });
        return { success: true };
    }
}

module.exports = new CatalogService();
