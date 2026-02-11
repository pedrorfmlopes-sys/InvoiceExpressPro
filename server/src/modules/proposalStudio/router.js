const express = require('express');
const router = express.Router();
const controller = require('./controller');

// Ingestion
router.post('/clone', (req, res) => controller.cloneToProposal(req, res));

// CRUD
router.get('/', (req, res) => controller.getProposals(req, res));
router.get('/:id', (req, res) => controller.getProposal(req, res));
router.put('/:id', (req, res) => controller.updateProposal(req, res));
router.delete('/:id', (req, res) => controller.deleteProposal(req, res));

module.exports = router;
