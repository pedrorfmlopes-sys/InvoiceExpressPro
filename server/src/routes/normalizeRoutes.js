const express = require('express');
const router = express.Router();
const normalizeController = require('../controllers/normalizeController');

// Using GET as per smoke test, even if it has side-effects (Legacy quirks)
router.get('/', normalizeController.normalize);
router.post('/', normalizeController.addRule);
router.delete('/', normalizeController.deleteRule);

module.exports = router;
