const express = require('express');
const Controller = require('./controller');
const { requireAuth } = require('../../middlewares/auth');

// 1. Labels Management Router (/api/labels)
const labelsRouter = express.Router();
// Use Auth for operations
labelsRouter.use(requireAuth);

labelsRouter.get('/', Controller.getLabels);
labelsRouter.post('/', Controller.createLabel);
labelsRouter.patch('/:id', Controller.updateLabel);
labelsRouter.delete('/:id', Controller.deleteLabel);

// 2. Doc Labels Router (/api/doc-labels)
const docLabelsRouter = express.Router();
docLabelsRouter.use(requireAuth);

docLabelsRouter.get('/:docId', Controller.getDocLabels);
docLabelsRouter.put('/:docId', Controller.setDocLabels); // PUT as it replaces set
// docLabelsRouter.post('/:docId', ... append ...); // Future

// 3. Node Labels Router (/api/node-labels) - Wait, mounting logic?
// In index.js `router.use` usually mounts sub-routers.
// I'll assume I should export a new router or attach to existing one?
// `index.js` exports object { labelsRouter, docLabelsRouter }.
// I'll add `nodeLabelsRouter`.
const nodeLabelsRouter = express.Router();
nodeLabelsRouter.use(requireAuth);
nodeLabelsRouter.get('/:nodeId', Controller.getNodeLabels);
nodeLabelsRouter.put('/:nodeId', Controller.setNodeLabels);

module.exports = {
    labelsRouter,
    docLabelsRouter,
    nodeLabelsRouter
};
