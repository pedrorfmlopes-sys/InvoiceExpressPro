const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class AliasService {
    /**
     * Records a new alias mapping the original SKU to the user-provided corrected SKU.
     */
    async learnAlias(brand, originalSku, correctedSku) {
        if (!brand || !originalSku || !correctedSku) {
            throw new Error('Missing required fields for alias creation');
        }

        const b = brand.toLowerCase();
        const o = String(originalSku).trim();
        const c = String(correctedSku).trim();

        if (o === c) {
            return { success: true, message: 'SKUs are identical, no learning needed.' };
        }

        const existing = await knex('catalog_aliases').whereRaw('LOWER(brand) = ?', [b]).andWhere({ original_sku: o }).first();

        if (existing) {
            // Update if user changed their mind about the correction
            await knex('catalog_aliases')
                .where({ id: existing.id })
                .update({ corrected_sku: c });
            return { success: true, message: 'Alias updated', action: 'updated' };
        } else {
            // Create new alias
            await knex('catalog_aliases').insert({
                id: uuidv4(),
                brand: b,
                original_sku: o,
                corrected_sku: c
            });
            return { success: true, message: 'Alias learned', action: 'created' };
        }
    }

    /**
     * Lists all learned aliases, optionally filtered by brand.
     */
    async getAliases(brand) {
        let query = knex('catalog_aliases');

        if (brand && brand !== 'TODAS' && brand !== 'ALL') {
            query = query.whereRaw('LOWER(brand) = ?', [brand.toLowerCase()]);
        }

        return await query.orderBy('created_at', 'desc');
    }

    /**
     * Deletes a specific learned alias.
     */
    async deleteAlias(id) {
        if (!id) throw new Error('Missing alias id');
        await knex('catalog_aliases').where({ id }).delete();
        return { success: true };
    }

    /**
     * Applies learned aliases in bulk to an array of items.
     * Often used during extraction loops to swap SKUs invisibly before processing.
     * Expects an array of objects that have at least a `sku` string property.
     * Note: Modifies the array items in-place.
     */
    async applyAliases(brand, lines) {
        if (!brand || !lines || lines.length === 0) return lines;

        const b = brand.toLowerCase();

        // Fetch ALL aliases for this brand in memory to avoid N+1 queries.
        // Usually, alias lists are small (a few hundred max).
        const aliasesList = await knex('catalog_aliases').whereRaw('LOWER(brand) = ?', [b]);

        if (aliasesList.length === 0) return lines;

        const aliasMap = new Map();
        for (const alias of aliasesList) {
            aliasMap.set(alias.original_sku.toLowerCase(), alias.corrected_sku);
        }

        let appliedCount = 0;

        for (const line of lines) {
            if (!line.sku) continue;

            const rawSkuLower = String(line.sku).trim().toLowerCase();

            if (aliasMap.has(rawSkuLower)) {
                // Apply the correction
                line.original_raw_sku = line.sku; // backup original just in case it's needed for UI hover state
                line.sku = aliasMap.get(rawSkuLower);
                line._alias_applied = true; // Flag for debug
                appliedCount++;
            }
        }

        if (appliedCount > 0) {
            console.log(`[AliasService] Applied ${appliedCount} alias correction(s) for brand ${brand}`);
        }

        return lines;
    }
}

module.exports = new AliasService();
