const express = require('express');
const router = express.Router();
const Controller = require('./controller');
const { requireAuth } = require('../../middlewares/auth');

router.use(requireAuth);

// Nodes
router.get('/nodes', Controller.listNodes);
router.post('/nodes', Controller.createNode);
router.patch('/nodes/:id', Controller.updateNode);
router.post('/nodes/:id/move', Controller.moveNode);
router.get('/nodes/:id/path', Controller.getPath);

// Links
router.get('/links/:nodeId', Controller.getLinks);
router.post('/links', Controller.createLink);
router.delete('/links', Controller.deleteLink);

// Docs Association
router.get('/nodes/:id/docs', Controller.getDocs);
router.put('/nodes/:id/docs', Controller.setDocs); // Replace all
router.post('/nodes/:id/docs', Controller.addDoc); // Append one
router.delete('/nodes/:id/docs/:docId', Controller.removeDoc); // Remove one

// Search
router.get('/search', Controller.search);
router.get('/by-doc', Controller.searchByDoc);

module.exports = router;
