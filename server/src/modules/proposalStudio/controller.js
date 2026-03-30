const service = require('./service');
const presetService = require('./ProposalPresetService');
const logisticsService = require('./logisticsService');

class ProposalStudioController {
    async cloneToProposal(req, res) {
        try {
            const { docId } = req.body;
            const project = req.project;
            if (!docId) return res.status(400).json({ error: 'docId is required' });

            const result = await service.cloneToProposal(project, docId, req.user?.id);
            res.json(result);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async createBlankProposal(req, res) {
        try {
            const project = req.project;
            const { name, brand_id } = req.body || {};
            const result = await service.createBlankProposal(project, name, brand_id);
            res.status(201).json(result);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async getProposals(req, res) {
        try {
            const project = req.project;
            const { status, brand_id, client_ref } = req.query;
            const proposals = await service.getProposals(project, { status, brand_id, client_ref });
            res.json(proposals);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getProposal(req, res) {
        try {
            const { id } = req.params;
            console.log(`[ProposalController] Fetching proposal ID: ${id}`);
            const proposal = await service.getProposal(id);
            if (!proposal) {
                console.warn(`[ProposalController] Proposal NOT FOUND: ${id}`);
                return res.status(404).json({ error: 'Proposta não encontrada' });
            }
            res.json(proposal);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getWorkingCopy(req, res) {
        try {
            const { id } = req.params;
            const result = await service.getWorkingCopy(id);
            if (!result) {
                return res.status(404).json({ error: 'Proposta nÃ£o encontrada' });
            }
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async saveWorkingCopy(req, res) {
        try {
            const { id } = req.params;
            const result = await service.saveWorkingCopy(id, req.body || {});
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async commitWorkingCopy(req, res) {
        try {
            const { id } = req.params;
            const result = await service.commitWorkingCopy(id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async discardWorkingCopy(req, res) {
        try {
            const { id } = req.params;
            const result = await service.discardWorkingCopy(id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getProposalVersions(req, res) {
        try {
            const { id } = req.params;
            const result = await service.getProposalVersions(id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async restoreProposalVersion(req, res) {
        try {
            const { id, versionId } = req.params;
            const result = await service.restoreProposalVersion(id, versionId);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async updateProposal(req, res) {
        try {
            const { id } = req.params;
            const result = await service.updateProposal(id, req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async patchProposal(req, res) {
        try {
            const { id } = req.params;
            const result = await service.patchProposal(id, req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async deleteProposal(req, res) {
        try {
            const { id } = req.params;
            await service.deleteProposal(id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getSourceSyncCandidates(req, res) {
        try {
            const { id } = req.params;
            const result = await service.getSourceSyncCandidates(id);
            res.json(result);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async getSourceSyncPreview(req, res) {
        try {
            const { id } = req.params;
            const { sourceDocId } = req.query;
            const result = await service.getSourceSyncPreview(id, sourceDocId || null);
            res.json(result);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async applySourceSync(req, res) {
        try {
            const { id } = req.params;
            const result = await service.applySourceSync(id, req.body || {});
            res.json(result);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async exportPdf(req, res) {
        try {
            const { id } = req.params;
            const buffer = await service.generatePdf(id);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=proposta_${id}.pdf`);
            res.send(buffer);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async exportExcel(req, res) {
        try {
            const { id } = req.params;
            const buffer = await service.generateExcel(id);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=proposta_${id}.xlsx`);
            res.send(buffer);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    async exportConsolidated(req, res) {
        try {
            const project = req.project;
            const { status, brand_id, client_ref } = req.query;
            const buffer = await service.generateConsolidatedExcel(project, { status, brand_id, client_ref });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=listagem_propostas_consolidada_${new Date().toISOString().slice(0, 10)}.xlsx`);
            res.send(buffer);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    // --- PRESETS ---
    async getPresets(req, res) {
        try {
            const project = req.project;
            const { category } = req.query;
            const presets = await presetService.getPresets(project, category);
            res.json(presets);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async createPreset(req, res) {
        try {
            const project = req.project;
            const preset = await presetService.createPreset(project, req.body);
            res.json(preset);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async deletePreset(req, res) {
        try {
            const project = req.project;
            const { id } = req.params;
            await presetService.deletePreset(project, id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
    async updatePreset(req, res) {
        try {
            const project = req.project;
            const { id } = req.params;
            await presetService.updatePreset(project, id, req.body);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // --- LOGISTICS (Phase 1) ---
    async updateLogisticsHeader(req, res) {
        try {
            const { id } = req.params;
            const result = await logisticsService.updateProposalLogistics(id, req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async updateLogisticsLines(req, res) {
        try {
            const { id } = req.params;
            const { lineIds, updates } = req.body;
            const result = await logisticsService.updateLineLogistics(id, lineIds, updates);
            res.json(result || { ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async recalculateLogistics(req, res) {
        try {
            const { id } = req.params;
            const result = await logisticsService.recalculateShipDates(id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async autoCategorizeLogistics(req, res) {
        try {
            const { id } = req.params;
            const result = await logisticsService.autoCategorizeLines(id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async calculatePreview(req, res) {
        try {
            const { id } = req.params;
            const result = await logisticsService.calculatePreview(id, req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new ProposalStudioController();
