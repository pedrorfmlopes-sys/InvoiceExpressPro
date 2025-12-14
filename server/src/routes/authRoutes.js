const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

router.post('/bootstrap', authController.bootstrap);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
if (process.env.NODE_ENV !== 'production' && process.env.QA_MODE === 'true') {
    router.post('/qa/seed-user', authController.seedUser); // QA Helper
}
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
