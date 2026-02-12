const service = require('./service');

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

    async getProposals(req, res) {
        try {
            const project = req.project;
            const proposals = await service.getProposals(project);
            res.json(proposals);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getProposal(req, res) {
        try {
            const { id } = req.params;
            const proposal = await service.getProposal(id);
            if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada' });
            res.json(proposal);
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

    async deleteProposal(req, res) {
        try {
            const { id } = req.params;
            await service.deleteProposal(id);
            res.json({ ok: true });
        } catch (e) {
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
}

module.exports = new ProposalStudioController();
