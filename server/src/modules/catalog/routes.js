// server/src/modules/catalog/routes.js
const express = require('express');
const router = express.Router();
const CatalogController = require('./controller');
const { requireAuth, requireRole } = require('../../middlewares/auth');
const multer = require('multer');
const path = require('path');

const upload = multer({ dest: 'uploads/temp/' });

router.post('/inspect', requireAuth, requireRole('admin'), upload.single('file'), CatalogController.inspectCatalog);
router.post('/inspect-collections', requireAuth, requireRole('admin'), CatalogController.inspectCollections);
router.post('/process', requireAuth, requireRole('admin'), CatalogController.processCatalog);
router.get('/search', requireAuth, CatalogController.search);
router.get('/finishes/:brand', requireAuth, CatalogController.getBrandFinishes);
router.get('/stats', requireAuth, CatalogController.getStats);
router.post('/resolve', requireAuth, CatalogController.resolveItem);
router.post('/resolve-bulk', requireAuth, CatalogController.resolveBulk);
router.post('/bulk-create', requireAuth, CatalogController.bulkCreate);
router.get('/collections', requireAuth, CatalogController.getCollections);
router.post('/collections/toggle', requireAuth, CatalogController.toggleCollection);
router.patch('/collections', requireAuth, CatalogController.updateCollection);
router.post('/collections', requireAuth, CatalogController.createCollection);
router.delete('/collections', requireAuth, CatalogController.deleteCollection);
router.patch('/finishes', requireAuth, CatalogController.updateFinish);
router.post('/finishes', requireAuth, CatalogController.createFinish);
router.delete('/finishes', requireAuth, CatalogController.deleteFinish);
router.get('/export', requireAuth, CatalogController.exportLibrary);
router.post('/import', requireAuth, upload.single('file'), CatalogController.importLibrary);
router.delete('/clear', requireAuth, requireRole('admin'), CatalogController.clearCatalog);

// Alias Routes
router.post('/aliases', requireAuth, CatalogController.learnAlias);
router.get('/aliases', requireAuth, CatalogController.getAliases);
router.delete('/aliases/:id', requireAuth, CatalogController.deleteAlias);


module.exports = router;
