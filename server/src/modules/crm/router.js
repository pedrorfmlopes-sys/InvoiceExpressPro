const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.get('/search', controller.search);
router.get('/lookup', controller.lookup);
router.get('/list', controller.list);
router.get('/vat/:vat', controller.getByVat);
router.post('/upsert', controller.upsert);
router.delete('/:id', controller.delete);

module.exports = router;
