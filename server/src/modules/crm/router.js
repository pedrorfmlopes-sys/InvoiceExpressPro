const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.get('/search', controller.search);
router.get('/vat/:vat', controller.getByVat);
router.post('/upsert', controller.upsert);

module.exports = router;
