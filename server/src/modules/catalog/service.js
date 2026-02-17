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
        let q = knex('catalog_items')
            .select('catalog_items.*', 'catalog_finishes.note_pt as finish_note', 'catalog_finishes.finish_code')
            .leftJoin('catalog_finishes', function () {
                this.on('catalog_items.brand', '=', 'catalog_finishes.brand')
                    .andOn('catalog_items.finish_group', '=', 'catalog_finishes.group_code');
            })
            .where({ 'catalog_items.brand': brand });

        if (query) {
            const terms = query.trim().split(/\s+/);
            if (terms.length > 1) {
                // Multi-term search: First term for SKU, others for handle or description
                const firstTerm = terms[0];
                const otherTerms = terms.slice(1);

                q = q.andWhere('catalog_items.sku', 'like', `%${firstTerm}%`);

                for (const term of otherTerms) {
                    if (!term) continue;
                    q = q.andWhere(function () {
                        this.where('catalog_items.handle', 'like', `%${term}%`)
                            .orWhere('catalog_items.description_pt', 'like', `%${term}%`)
                            .orWhere('catalog_items.description_it', 'like', `%${term}%`)
                            .orWhere('catalog_items.finish_group', 'like', `%${term}%`);
                    });
                }
            } else {
                // Single term: Match SKU, handle or description
                q = q.andWhere(function () {
                    this.where('catalog_items.sku', 'like', `%${query}%`)
                        .orWhere('catalog_items.handle', 'like', `%${query}%`)
                        .orWhere('catalog_items.description_pt', 'like', `%${query}%`)
                        .orWhere('catalog_items.description_it', 'like', `%${query}%`);
                });
            }
        }

        // Use groupBy to avoid multiple rows if a finish_group has multiple finish_codes
        return q.groupBy('catalog_items.id').limit(50).orderBy('catalog_items.sku', 'asc');
    }

    /**
     * Resolves a raw SKU (e.g., 1002-28-CR) to a catalog item and its finish notes.
     */
    async resolveItem(brand, rawSku) {
        if (brand === 'nicolazzi') {
            return this.resolveNicolazziSku(rawSku);
        }
        return { error: 'Brand not supported for auto-resolution yet' };
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
                    .whereRaw('? LIKE CONCAT(\'%\', finish_code)', [remainder])
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
