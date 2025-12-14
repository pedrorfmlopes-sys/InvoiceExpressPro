const express = require('express');
const router = express.Router();
const coreController = require('../controllers/v2/coreController');
const transactionController = require('../controllers/v2/transactionController');
const multer = require('multer');
const { PATHS } = require('../config/constants');
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
router.patch('/docs/:id', coreController.updateDoc);
router.post('/docs/finalize', coreController.finalizeDoc);
router.get('/doctypes', coreController.listDocTypes);
router.get('/docs/:id/link-suggestions', coreController.getLinkSuggestions);
router.post('/docs/bulk', coreController.bulkPatch);
router.post('/links', coreController.createLink);

// DocTypes CRUD (Admin Only)
const { requireRole } = require('../middlewares/auth');
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
