// server/src/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// Projects
router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.delete('/projects/:name', projectController.deleteProject);

// Health / Dirs
router.get('/health', projectController.health);
router.get('/dirs', projectController.listDirs);

module.exports = router;
