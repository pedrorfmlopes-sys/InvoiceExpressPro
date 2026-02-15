const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireRole } = require('../../middlewares/auth');

// All config routes require Auth + Admin
router.use(requireAuth);
router.use(requireRole('admin'));

// Secrets
router.get('/secrets', controller.getSecrets);
router.post('/secrets', controller.saveSecrets);

// DocTypes
// Use PUT or POST? ConfigTab.jsx uses PUT for doctypes: `await api.put(qp('/api/config/doctypes'...)`
router.get('/doctypes', controller.getDocTypes);
router.put('/doctypes', controller.saveDocTypes);
router.post('/doctypes', controller.saveDocTypes); // Alias for robustness
// Cleanup
router.delete('/reset-data', controller.resetData);
router.delete('/project', controller.deleteProject);

// UI Preferences
router.get('/ui', controller.getUI);
router.put('/ui', controller.updateUI);
router.post('/ui', controller.updateUI); // Alias

// Settings (Retention, etc.)
router.get('/settings', controller.getSettings);
router.post('/settings', controller.saveSettings);

module.exports = router;
