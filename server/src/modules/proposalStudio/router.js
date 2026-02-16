const express = require('express');
const router = express.Router();
const controller = require('./controller');

// Ingestion
router.post('/clone', (req, res) => controller.cloneToProposal(req, res));

// CRUD
router.get('/', (req, res) => controller.getProposals(req, res));
router.get('/:id', (req, res) => controller.getProposal(req, res));
router.put('/:id', (req, res) => controller.updateProposal(req, res));
router.patch('/:id', (req, res) => controller.patchProposal(req, res));
router.delete('/:id', (req, res) => controller.deleteProposal(req, res));

// Exports
router.get('/:id/pdf', (req, res) => controller.exportPdf(req, res));
router.get('/:id/excel', (req, res) => controller.exportExcel(req, res));

// Presets
router.get('/presets/list', (req, res) => controller.getPresets(req, res));
router.post('/presets', (req, res) => controller.createPreset(req, res));
router.delete('/presets/:id', (req, res) => controller.deletePreset(req, res));

module.exports = router;
