const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PATHS } = require('../../config/constants');

// Multer config (reusing logic but local instance for transparency/override)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(PATHS.UPLOADS)) fs.mkdirSync(PATHS.UPLOADS, { recursive: true });
        cb(null, PATHS.UPLOADS);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// POST /api/v2/extract
// Support single file 'file' OR JSON { docIds: [...] }
router.post('/extract', requireEntitlement('ai_extract'), upload.single('file'), controller.extract);

module.exports = router;
