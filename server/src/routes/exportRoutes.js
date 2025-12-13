const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

router.post('/export.xlsx', exportController.exportXlsx);

module.exports = router;
