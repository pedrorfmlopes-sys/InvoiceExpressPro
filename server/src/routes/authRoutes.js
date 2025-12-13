const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

router.post('/bootstrap', authController.bootstrap);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
