const knex = require('../../db/knex');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');

class ExtractionService {

    async listProfiles() {
        return knex('reading_profiles').orderBy('priority', 'desc');
    }

    async getProfile(id) {
        const profile = await knex('reading_profiles').where({ id }).first();
        if (!profile) return null;

        profile.fields = await knex('reading_profile_fields').where({ profile_id: id });
        profile.signatures = await knex('reading_profile_signatures').where({ profile_id: id });
        return profile;
    }

    async createProfile(data) {
        const { name, doc_type, priority, fields = [], signatures = [] } = data;
        const id = uuidv4();

        await knex.transaction(async trx => {
            await trx('reading_profiles').insert({
                id, name, doc_type, priority: priority || 1, active: true
            });

            if (fields.length) {
                const fieldsToInsert = fields.map(f => ({ ...f, profile_id: id }));
                await trx('reading_profile_fields').insert(fieldsToInsert);
            }

            if (signatures.length) {
                const sigsToInsert = signatures.map(s => ({ ...s, profile_id: id }));
                await trx('reading_profile_signatures').insert(sigsToInsert);
            }
        });
        return this.getProfile(id);
    }

    async updateProfile(id, data) {
        const { fields, signatures, ...updates } = data;
        await knex.transaction(async trx => {
            if (Object.keys(updates).length) {
                await trx('reading_profiles').where({ id }).update(updates);
            }

            if (fields) {
                await trx('reading_profile_fields').where({ profile_id: id }).del();
                if (fields.length) {
                    await trx('reading_profile_fields').insert(fields.map(f => ({ ...f, profile_id: id })));
                }
            }

            if (signatures) {
                await trx('reading_profile_signatures').where({ profile_id: id }).del();
                if (signatures.length) {
                    await trx('reading_profile_signatures').insert(signatures.map(s => ({ ...s, profile_id: id })));
                }
            }
        });
        return this.getProfile(id);
    }

    async deleteProfile(id) {
        return knex('reading_profiles').where({ id }).del();
    }

    async matchProfile(docBuffer) {
        try {
            const data = await pdfParse(docBuffer);
            const text = data.text;

            // Get all profiles with active signatures
            const profiles = await knex('reading_profiles')
                .where('active', true)
                .orderBy('priority', 'desc');

            let bestMatch = null;
            let maxScore = 0;

            for (const profile of profiles) {
                const signatures = await knex('reading_profile_signatures').where({ profile_id: profile.id });
                if (signatures.length === 0) continue; // Skip profiles without signatures (unless generic?)

                let score = 0;
                for (const sig of signatures) {
                    if (text.includes(sig.keyword)) {
                        score += sig.weight;
                    }
                }

                if (score > 0 && score > maxScore) {
                    maxScore = score;
                    bestMatch = profile;
                }
            }

            return { profile: bestMatch, confidence: maxScore > 0 ? 0.8 : 0.0 }; // Simplified confidence
        } catch (err) {
            console.error("Match Profile Error:", err);
            return { profile: null, confidence: 0 };
        }
    }

    // TODO: Implement actual coordinate extraction
    async extractWithProfile(docBuffer, profileId) {
        const profile = await this.getProfile(profileId);
        if (!profile) throw new Error("Profile not found");

        const data = await pdfParse(docBuffer);
        const text = data.text;

        // Mock extraction based on regex or just returning full text for now
        // Real implementation needs per-word coordinates

        const extracted = {};
        for (const field of profile.fields) {
            if (field.regex) {
                const match = text.match(new RegExp(field.regex));
                extracted[field.field_key] = match ? match[0] : null;
            }
        }

        return { extracted, debug_text_len: text.length };
    }
}

module.exports = new ExtractionService();
