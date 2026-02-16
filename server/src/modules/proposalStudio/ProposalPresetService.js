const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class ProposalPresetService {
    async getPresets(project, category = null) {
        const q = knex('proposal_presets')
            .where(function () {
                this.where('project', project).orWhere('is_global', true);
            })
            .orderBy('created_at', 'desc');

        if (category) {
            q.andWhere({ category });
        }

        return await q;
    }

    async createPreset(project, data) {
        const id = uuidv4();
        const row = {
            id,
            project,
            name: data.name,
            category: data.category,
            content: data.content,
            is_global: !!data.is_global,
            created_at: new Date(),
            updated_at: new Date()
        };

        await knex('proposal_presets').insert(row);
        return row;
    }

    async deletePreset(project, id) {
        // Only allow deleting if it belongs to this project or user is admin (simplified to project check for now)
        return await knex('proposal_presets').where({ project, id }).delete();
    }
}

module.exports = new ProposalPresetService();
