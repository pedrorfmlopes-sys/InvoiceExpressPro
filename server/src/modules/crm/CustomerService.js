const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const ZipHelper = require('../../utils/ZipHelper');

class CustomerService {
    /**
     * Normalizes a VAT number based on local/foreign heuristics.
     * International support: 9 to 15 digits.
     */
    normalizeVat(vat) {
        if (!vat) return null;
        let clean = vat.toString().replace(/[\s\.-]/g, '').toUpperCase();

        // Heuristic: If it's exactly 9 digits, assume it's a Portuguese NIF and prepend PT
        // UNLESS it already starts with another country code (e.g., ES, IT)
        if (/^\d{9}$/.test(clean)) {
            return `PT${clean}`;
        }

        // Return as is (could be foreign or already prefixed)
        // Length guard: 9-15 is reasonable for International VATs
        if (clean.length >= 9 && clean.length <= 15) {
            return clean;
        }

        return clean;
    }

    /**
     * Captures customer data from an extraction. 
     * Smart Merge: If exists, fills empty fields from current data.
     */
    async upsertFromExtraction(project, data, explicitUpdate = false, trx = null) {
        const db = trx || knex;
        // Deep access for structured extraction objects
        const rawVat = data.vat || data.customerVat || data.contribuinte || (data.entities && data.entities.customer && data.entities.customer.vat);

        const vat = this.normalizeVat(rawVat);
        if (!vat) return null;

        const existing = await db('customers').where({ vat, project }).first();

        // Deep access for name/address
        const rawName = data.name || data.customer || (data.entities && data.entities.customer && data.entities.customer.name) || 'Consumidor Final';
        const rawAddress = data.delivery_address || data.address || data.morada || (data.entities && data.entities.customer && data.entities.customer.address) || '';
        const country = ZipHelper.inferCountryFromAddress(rawAddress);

        const customerData = {
            name: rawName,
            address: rawAddress,
            country: country, // Added for Phase 11
            email: data.email || data.customerEmail || '',
            phone: data.phone || data.customerPhone || '',
            project: project,
            updated_at: new Date()
        };

        if (existing) {
            if (explicitUpdate) {
                await db('customers').where({ id: existing.id }).update(customerData);
                return { ...existing, ...customerData };
            }

            // SMART MERGE: Fill empty CRM fields from new extraction info
            const patch = {};
            if (!existing.address && customerData.address) patch.address = customerData.address;
            if (!existing.email && customerData.email) patch.email = customerData.email;
            if (!existing.phone && customerData.phone) patch.phone = customerData.phone;

            if (Object.keys(patch).length > 0) {
                console.log(`[CRM] ${trx ? '[TRX] ' : ''}Smart-merging data for customer ${existing.vat}`);
                await db('customers').where({ id: existing.id }).update(patch);
                return { ...existing, ...patch };
            }

            return existing;
        }

        // New customer
        const newCustomer = {
            id: uuidv4(),
            vat,
            ...customerData,
            created_at: new Date()
        };

        console.log(`[CRM] ${trx ? '[TRX] ' : ''}Creating NEW customer: ${newCustomer.name} (${newCustomer.vat})`);
        await db('customers').insert(newCustomer);
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

    async list(project, { page = 1, limit = 50, q } = {}) {
        const db = knex('customers');
        let query = db.where(function () {
            this.where('project', project).orWhere('project', 'default');
        });

        if (q) {
            const normalizedQuery = q.toString().toUpperCase().trim();
            query = query.where(function () {
                this.where(knex.raw('UPPER(name)'), 'like', `%${normalizedQuery}%`)
                    .orWhere(knex.raw('UPPER(vat)'), 'like', `%${normalizedQuery}%`);
            });
        }

        // Count
        const countQuery = query.clone().clearSelect().count('* as count').first();
        const totalParams = await countQuery;
        const total = parseInt(totalParams.count || totalParams['count(*)'] || 0, 10);

        // Rows
        const rows = await query.orderBy('updated_at', 'desc')
            .limit(limit)
            .offset((page - 1) * limit);

        return { rows, total, page, limit };
    }

    async delete(project, id) {
        return await knex('customers').where({ project, id }).delete();
    }
}

module.exports = new CustomerService();
