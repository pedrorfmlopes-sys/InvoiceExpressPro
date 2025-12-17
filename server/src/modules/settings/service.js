const knex = require('../../db/knex');

const SYSTEM_DEFAULTS = [
    { slug: 'fatura', label: 'Fatura' },
    { slug: 'recibo', label: 'Recibo' },
    { slug: 'fatura_recibo', label: 'Fatura-Recibo' },
    { slug: 'nota_credito', label: 'Nota de Crédito' },
    { slug: 'guia_remessa', label: 'Guia de Remessa' }
];

class SettingsService {
    async getDocTypes(project) {
        // Fetch all for project
        const rows = await knex('doc_types').where({ project });

        // If empty, return defaults (checking if we should seed them? No, just return them merged with empty custom list if we want purely virtual defaults, OR seed them now. 
        // For simplicity: return defaults + custom.
        // Actually, if DB is empty for this project, let's treat defaults as existing virtually.

        const customSlugs = new Set(rows.map(r => r.slug));
        const defaults = SYSTEM_DEFAULTS.filter(d => !customSlugs.has(d.slug)).map(d => ({ ...d, is_system: true }));

        return [...defaults, ...rows];
    }

    async createDocType(project, label) {
        const slug = label.toLowerCase().trim()
            .replace(/\s+/g, '_')
            .replace(/[^\w-]/g, '');

        // Check duplicates including defaults
        const existing = SYSTEM_DEFAULTS.find(d => d.slug === slug);
        if (existing) return existing;

        try {
            const [id] = await knex('doc_types').insert({
                project,
                slug,
                label,
                is_system: false
            }).returning('id'); // For PG. SQLite returns [id] too usually.

            return { id, project, slug, label, is_system: false };
        } catch (e) {
            // If unique constraint fails
            if (e.message.includes('unique')) {
                return await knex('doc_types').where({ project, slug }).first();
            }
            throw e;
        }
    }
}

module.exports = new SettingsService();
