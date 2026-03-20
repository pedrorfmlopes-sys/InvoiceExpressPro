const CustomerService = require('./CustomerService');
const SmartLookupService = require('./SmartLookupService');
const ShippingAddressService = require('./ShippingAddressService');

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

    async list(req, res) {
        try {
            const { page, limit, q } = req.query;
            const result = await CustomerService.list(req.project, { page, limit, q });
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            await CustomerService.delete(req.project, id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async lookup(req, res) {
        try {
            const { q } = req.query;
            const result = await SmartLookupService.lookup(q);
            if (!result) return res.status(404).json({ error: 'Nenhum resultado encontrado' });
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // --- Shipping Addresses ---
    async listShippingAddresses(req, res) {
        try {
            const results = await ShippingAddressService.list(req.project);
            res.json(results);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async upsertShippingAddress(req, res) {
        try {
            const result = await ShippingAddressService.upsert(req.project, req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async deleteShippingAddress(req, res) {
        try {
            const { id } = req.params;
            await ShippingAddressService.delete(req.project, id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new CustomerController();
