// server/src/modules/catalog/controller.js
const CatalogService = require('./service');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class CatalogController {

    async inspectCatalog(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const sheets = await CatalogService.inspectSheets(req.file.path);
            res.json({
                success: true,
                tempPath: req.file.path,
                tempFilename: req.file.filename,
                sheets
            });
        } catch (error) {
            console.error('[CatalogController] Inspect failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async inspectCollections(req, res) {
        try {
            const { tempFilename, sheetName, columnName } = req.body;
            if (!tempFilename || !sheetName || !columnName) {
                return res.status(400).json({ error: 'Missing parameters' });
            }

            const filePath = path.join('uploads/temp', tempFilename);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Temporary file not found' });
            }

            const collections = await CatalogService.getUniqueCollections(filePath, sheetName, columnName);
            res.json({ success: true, collections });
        } catch (error) {
            console.error('[CatalogController] Collection inspect failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async processCatalog(req, res) {
        try {
            const { brand, tempFilename, mappings } = req.body;
            if (!tempFilename) {
                return res.status(400).json({ error: 'Missing tempFilename' });
            }

            const filePath = path.join('uploads/temp', tempFilename);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Temporary file not found or expired' });
            }

            let result;
            const methodName = `process${brand.charAt(0).toUpperCase() + brand.slice(1)}Excel`;

            if (typeof CatalogService[methodName] === 'function') {
                result = await CatalogService[methodName](filePath, mappings);
            } else {
                return res.status(400).json({ error: `Brand "${brand}" is not supported yet for auto-processing` });
            }

            // Cleanup temp file after processing
            try { fs.unlinkSync(filePath); } catch (e) { console.error('Failed to cleanup temp file', e); }

            res.json({ success: true, message: `Catalog for ${brand} updated successfully`, stats: result.stats });
        } catch (error) {
            console.error('[CatalogController] Process failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async clearCatalog(req, res) {
        try {
            const { brand } = req.query;
            if (!brand) {
                return res.status(400).json({ error: 'Marca não especificada' });
            }

            const result = await CatalogService.clearBrandCatalog(brand);
            res.json(result);
        } catch (error) {
            console.error('[CatalogController] Clear failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { brand, q } = req.query;
            const items = await CatalogService.searchItems(brand, q);
            res.json(items);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getStats(req, res) {
        try {
            const stats = await CatalogService.getStats();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBrandFinishes(req, res) {
        try {
            const { brand } = req.params;
            const finishes = await CatalogService.getBrandFinishes(brand);
            res.json(finishes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async resolveItem(req, res) {
        try {
            const { brand, sku } = req.body;
            if (!brand || !sku) {
                return res.status(400).json({ error: 'Missing brand or sku' });
            }
            const result = await CatalogService.resolveItem(brand, sku);
            res.json(result);
        } catch (error) {
            console.error('[CatalogController] Resolve failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async resolveBulk(req, res) {
        try {
            const { brand, skus } = req.body;
            if (!brand || !Array.isArray(skus)) {
                return res.status(400).json({ error: 'Missing brand or skus array' });
            }
            const results = await CatalogService.resolveBulk(brand, skus);
            res.json(results);
        } catch (error) {
            console.error('[CatalogController] Bulk resolve failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async bulkCreate(req, res) {
        try {
            const { brand, baseData, priceMappings } = req.body;
            if (!brand || !baseData || !priceMappings) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const result = await CatalogService.bulkCreateItems(brand, baseData, priceMappings);
            res.json(result);
        } catch (error) {
            console.error('[CatalogController] Bulk create failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getCollections(req, res) {
        try {
            const { brand } = req.query;
            if (!brand) return res.status(400).json({ error: 'Brand required' });

            const collections = await CatalogService.getStoredCollections(brand);
            res.json(collections);
        } catch (error) {
            console.error('[CatalogController] Get collections failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async toggleCollection(req, res) {
        try {
            const { brand, name, isVisible } = req.body;
            if (!brand || !name) return res.status(400).json({ error: 'Missing parameters' });

            await CatalogService.toggleCollectionVisibility(brand, name, isVisible);
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Toggle failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updateCollection(req, res) {
        try {
            const { brand, name, leadTimeWeeks, leadTimeUnit, description, isVisible } = req.body;
            if (!brand || !name) return res.status(400).json({ error: 'Missing parameters' });

            await CatalogService.updateCollection(brand, name, { leadTimeWeeks, leadTimeUnit, description, isVisible });
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Update collection failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async createCollection(req, res) {
        try {
            const { brand, name, description, leadTimeWeeks, leadTimeUnit, isVisible } = req.body;
            if (!brand || !name) return res.status(400).json({ error: 'Missing brand or name' });

            await CatalogService.createCollection(brand, { name, description, leadTimeWeeks, leadTimeUnit, isVisible });
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Create collection failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async deleteCollection(req, res) {
        try {
            const { brand, name } = req.body;
            if (!brand || !name) return res.status(400).json({ error: 'Missing parameters' });

            await CatalogService.deleteCollection(brand, name);
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Delete collection failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updateFinish(req, res) {
        try {
            const { brand, finishCode, leadTimeWeeks, leadTimeUnit, description, name, groupCode } = req.body;
            if (!brand || !finishCode) return res.status(400).json({ error: 'Missing parameters' });

            await CatalogService.updateFinish(brand, finishCode, { leadTimeWeeks, leadTimeUnit, description, name, groupCode });
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Update finish failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async createFinish(req, res) {
        try {
            const { brand, finishCode, groupCode, name, description, leadTimeWeeks, leadTimeUnit } = req.body;
            if (!brand || !finishCode) return res.status(400).json({ error: 'Missing brand or finishCode' });

            await CatalogService.createFinish(brand, { finishCode, groupCode, name, description, leadTimeWeeks, leadTimeUnit });
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Create finish failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async deleteFinish(req, res) {
        try {
            const { brand, finishCode } = req.body;
            if (!brand || !finishCode) return res.status(400).json({ error: 'Missing parameters' });

            await CatalogService.deleteFinish(brand, finishCode);
            res.json({ success: true });
        } catch (error) {
            console.error('[CatalogController] Delete finish failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async exportLibrary(req, res) {
        try {
            const { brand, type } = req.query; // type: 'finishes' | 'collections'
            if (!brand || !type) return res.status(400).json({ error: 'Missing brand or type' });

            const data = await CatalogService.exportLibrary(brand, type);
            res.json(data);
        } catch (error) {
            console.error('[CatalogController] Export failed:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async importLibrary(req, res) {
        const filePath = req.file?.path;
        try {
            const { brand, type } = req.body; // type: 'collections' | 'finishes'
            if (!brand || !type) return res.status(400).json({ error: 'Missing brand or type' });
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

            let successCount = 0;
            let errorCount = 0;

            if (type === 'collections') {
                for (const row of rows) {
                    const name = row.name || row['Nome da Coleção'] || row['Nome'];
                    if (!name) continue;
                    try {
                        await CatalogService.createCollection(brand, {
                            name: String(name).trim(),
                            description: row.description || row['Descrição Técnica'] || null,
                            leadTimeWeeks: row.lead_time_weeks != null ? parseFloat(row.lead_time_weeks) : null,
                            leadTimeUnit: row.lead_time_unit || 'weeks',
                            isVisible: row.is_visible !== false && row.is_visible !== 0 && row.is_visible !== 'false'
                        });
                        successCount++;
                    } catch (e) { errorCount++; }
                }
            } else {
                for (const row of rows) {
                    const finishCode = row.finish_code || row['Código'];
                    if (!finishCode) continue;
                    try {
                        await CatalogService.createFinish(brand, {
                            finishCode: String(finishCode).trim(),
                            groupCode: row.group_code || row['Grupo'] || null,
                            name: row.name || row['Nome'] || null,
                            description: row.description || row['Descrição Técnica'] || null,
                            leadTimeWeeks: row.lead_time_weeks != null ? parseFloat(row.lead_time_weeks) : null,
                            leadTimeUnit: row.lead_time_unit || 'weeks'
                        });
                        successCount++;
                    } catch (e) { errorCount++; }
                }
            }

            res.json({ success: true, count: successCount, errors: errorCount });
        } catch (error) {
            console.error('[CatalogController] Import failed:', error);
            res.status(500).json({ error: error.message });
        } finally {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
}

module.exports = new CatalogController();
