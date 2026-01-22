const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class AssetsService {
    async findById(id) {
        return knex('assets').where({ id }).first();
    }

    async findByHash(sha256) {
        return knex('assets').where({ sha256 }).first();
    }

    async create(data) {
        // data: { id?, mime_type, ext, size_bytes, ... }
        const id = data.id || uuidv4();
        const { id: _, ...rest } = data;

        await knex('assets').insert({
            id,
            storage_driver: 'local',
            ...rest
        });
        return this.findById(id);
    }

    async list(kind) {
        const q = knex('assets').orderBy('created_at', 'desc');
        if (kind) q.where({ kind });
        return q;
    }

    async delete(id) {
        return knex('assets').where({ id }).del();
    }
}

module.exports = new AssetsService();
