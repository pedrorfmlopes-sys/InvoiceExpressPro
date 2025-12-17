const express = require('express');
const router = express.Router();
const controller = require('./controller');

// Using GET as per smoke test, even if it has side-effects (Legacy quirks)
router.get('/', controller.normalize);
router.post('/', controller.addRule);
router.delete('/', controller.deleteRule);

module.exports = router;
