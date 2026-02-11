const CustomerService = require('./CustomerService');

class CustomerController {
    async search(req, res) {
        try {
            const { q } = req.query;
            const results = await CustomerService.search(req.project, q);
            res.json(results);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getByVat(req, res) {
        try {
            const { vat } = req.params;
            const customer = await CustomerService.getByVat(req.project, vat);
            if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });
            res.json(customer);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async upsert(req, res) {
        try {
            // Explicit update from UI
            const customer = await CustomerService.upsertFromExtraction(req.project, req.body, true);
            res.json(customer);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new CustomerController();
