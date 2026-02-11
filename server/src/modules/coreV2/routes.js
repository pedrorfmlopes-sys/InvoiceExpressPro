const express = require('express');
const router = express.Router();
const coreController = require('./controller');
const transactionController = require('../transactions/controller');
const multer = require('multer');
const { PATHS } = require('../../config/constants');
const fs = require('fs');

// Multer config for specific V2 upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(PATHS.UPLOADS)) fs.mkdirSync(PATHS.UPLOADS, { recursive: true });
        cb(null, PATHS.UPLOADS);
    },
    filename: (req, file, cb) => {
        cb(null, `v2-${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Routes
router.post('/upload', upload.array('files'), coreController.upload);
router.post('/extract', coreController.extract);
router.get('/docs', coreController.listDocs);
router.get('/docs/:id/view', coreController.viewDoc); // NEW (Unified)
router.get('/docs/:id/json', coreController.getDocJson); // NEW (Unified)
router.patch('/docs/:id', coreController.updateDoc);
router.delete('/docs/:id', coreController.deleteDoc); // NEW (Unified)
router.post('/docs/finalize', coreController.finalizeDoc);
router.post('/docs/finalize-bulk', coreController.finalizeBulk);
router.get('/doctypes', coreController.listDocTypes);
router.get('/docs/:id/link-suggestions', coreController.getLinkSuggestions);
router.post('/docs/:id/reprocess', coreController.reprocess);
router.post('/links', coreController.createLink);

// --- Backups (Phase 8/20) ---
router.get('/docs/:id/backups', coreController.listBackups);
router.get('/backups/:backupId/data', coreController.getBackupData); // Phase 20
router.post('/backups/:backupId/restore', coreController.restoreBackup);
router.delete('/backups/:backupId', coreController.deleteBackup);

// Satellite Data Routes (for specialized viewers)
router.get('/extraction-data/:type/:id', coreController.getExtractionData);
router.post('/extraction-data/:type/:id', coreController.saveExtractionData);

// DocTypes CRUD (Admin Only)
const { requireRole } = require('../../middlewares/auth');
router.post('/doctypes', requireRole('admin'), coreController.createDocType);
router.put('/doctypes/:id', requireRole('admin'), coreController.updateDocType);
router.delete('/doctypes/:id', requireRole('admin'), coreController.deleteDocType);

// --- Transactions (V2.3) ---
router.post('/transactions', transactionController.create);
router.get('/transactions', transactionController.list);
router.get('/transactions/:id', transactionController.get);
router.post('/transactions/:id/add-docs', transactionController.addDocs);
router.post('/transactions/:id/remove-doc', transactionController.removeDoc);
router.post('/transactions/auto-link', transactionController.suggest);

router.post('/export.xlsx', coreController.exportXlsx);

module.exports = router;
