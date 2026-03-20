const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class ShippingAddressService {
    async list(project) {
        return await knex('shipping_addresses')
            .where(function () {
                this.where('project', project).orWhere('project', 'default');
            })
            .orderBy('name', 'asc');
    }

    async upsert(project, data) {
        const id = data.id || uuidv4();
        const addressData = {
            id,
            project,
            name: data.name,
            address: data.address,
            updated_at: new Date()
        };

        const existing = await knex('shipping_addresses').where({ id }).first();
        if (existing) {
            await knex('shipping_addresses').where({ id }).update(addressData);
            return { ...existing, ...addressData };
        }

        addressData.created_at = new Date();
        await knex('shipping_addresses').insert(addressData);
        return addressData;
    }

    async delete(project, id) {
        return await knex('shipping_addresses').where({ project, id }).delete();
    }
}

module.exports = new ShippingAddressService();
