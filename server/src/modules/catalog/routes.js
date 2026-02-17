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
router.get('/stats', requireAuth, CatalogController.getStats);
router.post('/resolve', requireAuth, CatalogController.resolveItem);
router.post('/bulk-create', requireAuth, CatalogController.bulkCreate);
router.get('/collections', requireAuth, CatalogController.getCollections);
router.post('/collections/toggle', requireAuth, CatalogController.toggleCollection);
router.delete('/clear', requireAuth, requireRole('admin'), CatalogController.clearCatalog);

module.exports = router;
