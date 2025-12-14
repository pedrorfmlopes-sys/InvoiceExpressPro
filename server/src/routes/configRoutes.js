// server/src/routes/configRoutes.js - Hotfix Config Secrets POST
const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

router.get('/doctypes', configController.getDocTypes);
router.get('/secrets', configController.getSecrets);
router.post('/secrets', configController.setSecrets);
router.put('/doctypes', configController.setDocTypes);

module.exports = router;
