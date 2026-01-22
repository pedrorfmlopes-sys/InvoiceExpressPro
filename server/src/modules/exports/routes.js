const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.post('/export.xlsx', controller.exportXlsx);

module.exports = router;
