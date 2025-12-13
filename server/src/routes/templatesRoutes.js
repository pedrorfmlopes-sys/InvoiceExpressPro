const express = require('express');
const router = express.Router();
const templatesController = require('../controllers/templatesController');

router.get('/', templatesController.getTemplates);

module.exports = router;
