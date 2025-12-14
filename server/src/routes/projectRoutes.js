// server/src/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const configController = require('../controllers/configController');

// Projects
router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.delete('/projects/:name', projectController.deleteProject);

// Health / Dirs
router.get('/health', projectController.health);
router.get('/dirs', projectController.listDirs);
router.post('/mkdir', projectController.mkdir);
router.post('/set-output', projectController.setOutput);
router.post('/app-logo', configController.uploadLogo);

module.exports = router;
