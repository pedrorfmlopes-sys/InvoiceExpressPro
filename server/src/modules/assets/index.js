const express = require('express');
const router = express.Router();
const multer = require('multer');
const Controller = require('./controller');
const { requireAuth } = require('../../middlewares/auth');

// Multer Config: Memory Storage, Limit 5MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Routes
// Upload: requires auth
// Routes
// Upload: requires auth
router.post('/upload', requireAuth, upload.single('file'), Controller.uploadAsset);

// List: requires auth
router.get('/', requireAuth, Controller.listAssets);

// Delete: requires auth
router.delete('/:id', requireAuth, Controller.deleteAsset);

// Get: Public for <img> tags
router.get('/:id', Controller.getAsset);
router.get('/:id/meta', requireAuth, Controller.getMeta);

module.exports = router;
