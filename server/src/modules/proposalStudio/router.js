const express = require('express');
const router = express.Router();
const controller = require('./controller');

// Ingestion
router.post('/clone', (req, res) => controller.cloneToProposal(req, res));

// CRUD
router.post('/', (req, res) => controller.createBlankProposal(req, res));
router.get('/', (req, res) => controller.getProposals(req, res));
router.get('/:id', (req, res) => controller.getProposal(req, res));
router.get('/:id/working-copy', (req, res) => controller.getWorkingCopy(req, res));
router.put('/:id/working-copy', (req, res) => controller.saveWorkingCopy(req, res));
router.post('/:id/working-copy/commit', (req, res) => controller.commitWorkingCopy(req, res));
router.delete('/:id/working-copy', (req, res) => controller.discardWorkingCopy(req, res));
router.get('/:id/versions', (req, res) => controller.getProposalVersions(req, res));
router.post('/:id/versions/:versionId/restore', (req, res) => controller.restoreProposalVersion(req, res));
router.put('/:id', (req, res) => controller.updateProposal(req, res));
router.patch('/:id', (req, res) => controller.patchProposal(req, res));
router.delete('/:id', (req, res) => controller.deleteProposal(req, res));
router.get('/:id/source-sync/candidates', (req, res) => controller.getSourceSyncCandidates(req, res));
router.get('/:id/source-sync/preview', (req, res) => controller.getSourceSyncPreview(req, res));
router.post('/:id/source-sync/apply', (req, res) => controller.applySourceSync(req, res));

// Exports
router.get('/export/items', (req, res) => controller.exportConsolidated(req, res));
router.get('/:id/pdf', (req, res) => controller.exportPdf(req, res));
router.get('/:id/excel', (req, res) => controller.exportExcel(req, res));

// Presets
router.get('/presets/list', (req, res) => controller.getPresets(req, res));
router.post('/presets', (req, res) => controller.createPreset(req, res));
router.put('/presets/:id', (req, res) => controller.updatePreset(req, res));
router.delete('/presets/:id', (req, res) => controller.deletePreset(req, res));

// Logistics (Phase 1)
router.put('/:id/logistics', (req, res) => controller.updateLogisticsHeader(req, res));
router.post('/:id/logistics/lines', (req, res) => controller.updateLogisticsLines(req, res));
router.post('/:id/logistics/calculate', (req, res) => controller.recalculateLogistics(req, res));
router.post('/:id/logistics/auto-categorize', (req, res) => controller.autoCategorizeLogistics(req, res));
router.post('/:id/logistics/calculate-preview', (req, res) => controller.calculatePreview(req, res));

module.exports = router;
