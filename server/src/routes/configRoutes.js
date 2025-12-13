const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

router.get('/doctypes', configController.getDocTypes);
router.get('/secrets', configController.getSecrets);

module.exports = router;
