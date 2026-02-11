const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class CustomerService {
    /**
     * Normalizes a VAT number based on local/foreign heuristics.
     */
    normalizeVat(vat) {
        if (!vat) return null;
        let clean = vat.toString().replace(/[\s\.-]/g, '').toUpperCase();

        // Heuristic: If it's exactly 9 digits, assume it's a Portuguese NIF and prepend PT
        if (/^\d{9}$/.test(clean)) {
            return `PT${clean}`;
        }

        // Return as is (could be foreign or already prefixed)
        return clean;
    }

    /**
     * Captures customer data from an extraction. 
     * Does NOT overwrite if already exists, unless explicit.
     */
    async upsertFromExtraction(project, data, explicitUpdate = false) {
        const vat = this.normalizeVat(data.vat || data.customerVat || data.contribuinte);
        if (!vat) return null;

        const existing = await knex('customers').where({ vat }).first();

        const customerData = {
            name: data.name || data.customer || 'Consumidor Final',
            address: data.delivery_address || data.address || data.morada || '',
            email: data.email || data.customerEmail || '',
            phone: data.phone || data.customerPhone || '',
            project: project,
            updated_at: new Date()
        };

        if (existing) {
            if (explicitUpdate) {
                await knex('customers').where({ id: existing.id }).update(customerData);
                return { ...existing, ...customerData };
            }
            // Just return existing, don't touch it automatically
            return existing;
        }

        // New customer
        const newCustomer = {
            id: uuidv4(),
            vat,
            ...customerData,
            created_at: new Date()
        };

        await knex('customers').insert(newCustomer);
        return newCustomer;
    }

    async search(project, query) {
        if (!query) return [];
        const normalizedQuery = query.toString().toUpperCase().trim();
        console.log(`[CRM] Searching for "${normalizedQuery}" in project "${project}" (with default fallback)`);

        const results = await knex('customers')
            .where(function () {
                this.where('project', project)
                    .orWhere('project', 'default');
            })
            .where(function () {
                this.where(knex.raw('UPPER(name)'), 'like', `%${normalizedQuery}%`)
                    .orWhere(knex.raw('UPPER(vat)'), 'like', `%${normalizedQuery}%`);
            })
            .limit(10);

        console.log(`[CRM] Found ${results.length} results`);
        return results;
    }

    async getByVat(project, vat) {
        const normalized = this.normalizeVat(vat);
        if (!normalized) return null;
        return await knex('customers').where({ project, vat: normalized }).first();
    }
}

module.exports = new CustomerService();
