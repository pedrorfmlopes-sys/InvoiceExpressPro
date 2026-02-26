// server/src/modules/catalog/controller.js
const CatalogService = require('./service');
const path = require('path');
const fs = require('fs');

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
            if (brand === 'nicolazzi') {
                result = await CatalogService.processNicolazziExcel(filePath, mappings);
            } else {
                return res.status(400).json({ error: 'Brand not supported yet for auto-processing' });
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
}

module.exports = new CatalogController();
