// server/src/routes/docRoutes.js
const express = require('express');
const router = express.Router();
const docController = require('../controllers/docController');

router.patch('/doc/:id', docController.updateDoc);
router.delete('/doc/:id', docController.deleteDoc);
router.post('/doc/finalize', docController.finalizeDoc);
router.post('/docs/finalize-bulk', docController.finalizeBulk);

router.get('/doc/view', docController.viewDoc);

// Excel/Data
router.get('/excel.json', docController.getExcelJson);

module.exports = router;
