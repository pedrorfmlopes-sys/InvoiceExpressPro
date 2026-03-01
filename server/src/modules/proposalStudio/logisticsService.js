const knex = require('../../db/knex');
const { calculateShipDate } = require('../logistics/calendarEngine');

/**
 * Updates logistics settings for the proposal and triggers a full recalculation.
 */
async function updateProposalLogistics(id, { order_date, lead_time_weeks, notes, rules }) {
    // 1. Update Proposal Header
    const updates = {};
    if (order_date !== undefined) updates.order_confirmation_date = order_date ? new Date(order_date) : null;
    if (lead_time_weeks !== undefined) updates.general_lead_time_weeks = lead_time_weeks;
    if (notes !== undefined) updates.logistics_notes = notes;

    // Nuclear Option: Explicit Postgres Casting for JSONB columns
    if (rules !== undefined) {
        const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';
        if (isPg) {
            // Explicitly cast to jsonb using Knex Raw for Postgres (Render)
            updates.lead_time_rules = knex.raw('?::jsonb', [JSON.stringify(rules || [])]);
        } else {
            // Local SQLite (Production) - standard object handling
            updates.lead_time_rules = (rules && Array.isArray(rules) && rules.length > 0) ? rules : null;
        }
    }

    await knex('custom_proposals').where({ id }).update(updates);

    // 2. Trigger Full Recalculation
    return await recalculateShipDates(id);
}

/**
 * Bulk update line logistics.
 * @param {string} proposalId 
 * @param {string[]} lineIds - Array of IDs to update
 * @param {object} updates - { lead_time_weeks, category, manual_override }
 */
async function updateLineLogistics(proposalId, lineIds, updates) {
    if (!lineIds || lineIds.length === 0) return;

    await knex('proposal_lines')
        .whereIn('id', lineIds)
        .andWhere({ proposal_id: proposalId })
        .update({
            lead_time_weeks: updates.lead_time_weeks,
            production_category: updates.category,
            is_manual_override: updates.manual_override || false,
            // If manual date provided directly, set it as Date object
            predicted_ship_date: updates.manual_date ? new Date(updates.manual_date) : undefined
        });

    // Recalculate only these lines if not manual date forced
    if (!updates.manual_date) {
        return await recalculateShipDates(proposalId, lineIds);
    }
}

/**
 * Core Logic: Recalculates 'predicted_ship_date' for lines.
 * Filters by lineIds if provided, otherwise all lines.
 */
async function recalculateShipDates(proposalId, specificLineIds = null) {
    // 1. Get Proposal Context
    const proposal = await knex('custom_proposals').where({ id: proposalId }).first();
    if (!proposal || !proposal.order_confirmation_date) {
        return { success: false, reason: 'No Order Confirmation Date set.' };
    }

    const startDate = new Date(proposal.order_confirmation_date);

    // Parse rules
    let rules = [];
    try {
        rules = typeof proposal.lead_time_rules === 'string'
            ? JSON.parse(proposal.lead_time_rules)
            : (proposal.lead_time_rules || []);
    } catch (e) {
        console.error("[LogisticsService] Failed to parse rules:", e);
    }

    // 2. Get Lines
    let query = knex('proposal_lines').where({ proposal_id: proposalId });
    if (specificLineIds) {
        query = query.whereIn('id', specificLineIds);
    }
    const lines = await query;

    // 3. Process each line
    const batchUpdates = [];

    for (const line of lines) {
        // Determine Context (Brand + Rules)
        let meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
        const lineBrandId = (meta.brand_id || meta.brand || proposal.brand_id || 'nicolazzi').toLowerCase();

        let leadTime = null;
        let rule = null;

        if (line.is_manual_override) {
            // Use line's own lead time
            const val = line.lead_time_weeks !== null && line.lead_time_weeks !== undefined ? line.lead_time_weeks : 8;
            leadTime = { value: val, unit: 'weeks' };
        } else {
            // 2. Determine Rule (Priority: Finish > Collection > Category > Brand > Global)
            const series = (meta.series || meta.collection || meta.brand_meta?.series || '').trim().toLowerCase();
            const finish = (meta.finish_code || meta.finishCode || meta.brand_meta?.finishCode || '').trim().toLowerCase();
            const cat = (line.production_category || '').trim().toLowerCase();
            const b = lineBrandId;

            rule =
                rules.find(r => finish && r.target.toLowerCase() === `finish:${b}:${finish}`) ||
                rules.find(r => series && r.target.toLowerCase() === `collection:${b}:${series}`) ||
                rules.find(r => cat && r.target.toLowerCase() === `category:${b}:${cat}`) ||
                rules.find(r => r.target.toLowerCase() === `brand:${b}`) ||
                // Legacy Matches
                rules.find(r => finish && r.target.toLowerCase() === `finish:${finish}`) ||
                rules.find(r => series && r.target.toLowerCase() === `collection:${series}`) ||
                rules.find(r => cat && r.target.toLowerCase() === `category:${cat}`) ||
                rules.find(r => r.target.toLowerCase() === 'global');

            if (rule) {
                leadTime = { value: rule.value, unit: rule.unit };
            } else {
                // Fallback to legacy field
                const val = (line.lead_time_weeks !== null && line.lead_time_weeks !== undefined)
                    ? line.lead_time_weeks
                    : (proposal.general_lead_time_weeks !== null && proposal.general_lead_time_weeks !== undefined ? proposal.general_lead_time_weeks : 8);
                leadTime = { value: val, unit: 'weeks' };
            }
        }

        // Calculate (using line-specific brand context)
        const shipDate = await calculateShipDate(startDate, leadTime, lineBrandId);

        batchUpdates.push({
            id: line.id,
            predicted_ship_date: shipDate ? new Date(shipDate) : null
        });
    }

    // 4. Batch Update
    for (const u of batchUpdates) {
        await knex('proposal_lines').where({ id: u.id }).update({ predicted_ship_date: u.predicted_ship_date });
    }

    return { success: true, updated: batchUpdates.length };
}

/**
 * NEW: Calculate Preview
 * Takes current rules and order date, returns calculated dates for lines without saving.
 */
async function calculatePreview(proposalId, { order_date, rules, manual_overrides = [] }) {
    console.log(`[LogisticsPreview] Calculating for ${proposalId}. Anchor: ${order_date}. Overrides: ${manual_overrides.length}`);
    const proposal = await knex('custom_proposals').where({ id: proposalId }).first();
    if (!proposal) return { success: false, reason: 'Proposal not found' };

    const startDate = order_date ? new Date(order_date) : (proposal.order_confirmation_date ? new Date(proposal.order_confirmation_date) : null);
    if (!startDate) return { success: false, reason: 'No Order Date' };

    const lines = await knex('proposal_lines').where({ proposal_id: proposalId });
    const results = [];

    for (const line of lines) {
        let isManual = !!line.is_manual_override;
        let leadTime;

        // Check if this line has a manual override in the draft
        const override = manual_overrides.find(o => String(o.id) === String(line.id));

        if (override) {
            if (override.manual_override === false) {
                // User wants to revert to rules
                isManual = false;
                leadTime = null;
            } else if (override.manual_override === true || override.lead_time_weeks !== undefined) {
                leadTime = {
                    value: override.value !== undefined ? override.value : override.lead_time_weeks,
                    unit: override.unit || 'weeks'
                };
                isManual = true;
            }
        }

        if (!isManual) {
            // Apply Rules
            let meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
            const lineBrandId = (meta.brand_id || meta.brand || proposal.brand_id || 'nicolazzi').toLowerCase().trim();
            const series = (meta.series || meta.collection || meta.brand_meta?.series || '').trim().toLowerCase();
            const finish = (meta.finish_code || meta.finishCode || meta.brand_meta?.finishCode || '').trim().toLowerCase();
            const cat = (line.production_category || '').trim().toLowerCase();
            const b = lineBrandId;

            let rule =
                rules.find(r => finish && r.target.toLowerCase() === `finish:${b}:${finish}`) ||
                rules.find(r => series && r.target.toLowerCase() === `collection:${b}:${series}`) ||
                rules.find(r => cat && r.target.toLowerCase() === `category:${b}:${cat}`) ||
                rules.find(r => r.target.toLowerCase() === `brand:${b}`) ||
                // Legacy Matches
                rules.find(r => finish && r.target.toLowerCase() === `finish:${finish}`) ||
                rules.find(r => series && r.target.toLowerCase() === `collection:${series}`) ||
                rules.find(r => cat && r.target.toLowerCase() === `category:${cat}`) ||
                rules.find(r => r.target.toLowerCase() === 'global');

            if (line.sku && rule) {
                console.log(`[LogisticsPreview] SKU: ${line.sku} MATCHED RULE: ${rule.target} VALUE: ${rule.value}`);
            }

            leadTime = rule ? { value: rule.value, unit: rule.unit } : { value: line.lead_time_weeks || proposal.general_lead_time_weeks || 8, unit: 'weeks' };
        }

        const meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
        const lineBrandId = (meta.brand_id || meta.brand || proposal.brand_id || 'nicolazzi').toLowerCase();

        const shipDate = await calculateShipDate(startDate, leadTime, lineBrandId);
        const shipTimestamp = shipDate ? shipDate.getTime() : null;

        results.push({
            id: line.id,
            predicted_ship_date: shipTimestamp,
            lead_time_weeks: leadTime.unit === 'weeks' ? leadTime.value : (leadTime.unit === 'months' ? leadTime.value * 4 : Math.ceil(leadTime.value / 7)),
            actual_lead_time_value: leadTime.value,
            actual_lead_time_unit: leadTime.unit,
            is_manual_override: isManual ? 1 : 0
        });
    }

    return { success: true, lines: results };
}

/**
 * Smart Detection: Auto-categorize lines based on keywords and resolve Collections from catalog.
 */
async function autoCategorizeLines(proposalId) {
    const proposal = await knex('custom_proposals').where({ id: proposalId }).first();
    const lines = await knex('proposal_lines').where({ proposal_id: proposalId });

    const ROUGH_KEYWORDS = ['CORPO', 'INCASSO', 'BOX', 'UNIVERSAL', 'GREZZO', 'MESCOLATORE', 'PARTE INCASSO', 'R099', 'CORPO INC'];
    const FINISH_KEYWORDS = ['ESTERNA', 'PARTE ESTERNA', 'PLACCA', 'MANIGLIA', 'LEVA', 'KIT ESTERNO'];

    const updates = [];

    for (const line of lines) {
        const desc = (line.description || '').toUpperCase();
        let cat = line.production_category || 'standard';

        // 1. Categorization by keywords
        if (ROUGH_KEYWORDS.some(k => desc.includes(k))) {
            cat = 'rough_parts';
        } else if (FINISH_KEYWORDS.some(k => desc.includes(k))) {
            cat = 'finishings';
        }

        // 2. Collection Resolution (Series)
        // If series is missing, try to find it in catalog
        let meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
        let series = meta.brand_meta?.series || '';

        if (!series && proposal.brand_id && line.sku) {
            // Lookup in catalog
            const catalogItem = await knex('catalog_items')
                .where({ brand: proposal.brand_id, sku: line.sku })
                .first();

            if (catalogItem && catalogItem.series) {
                series = catalogItem.series;
                if (!meta.brand_meta) meta.brand_meta = {};
                meta.brand_meta.series = series;
            }
        }

        const shouldUpdate = cat !== line.production_category || series !== (line.extra_attributes?.brand_meta?.series);

        if (shouldUpdate) {
            updates.push({
                id: line.id,
                production_category: cat,
                extra_attributes: JSON.stringify(meta)
            });
        }
    }

    for (const u of updates) {
        await knex('proposal_lines').where({ id: u.id }).update({
            production_category: u.production_category,
            extra_attributes: typeof u.extra_attributes === 'string'
                ? u.extra_attributes
                : JSON.stringify(u.extra_attributes || {})
        });
    }

    return { categorized: updates.length };
}


module.exports = {
    updateProposalLogistics,
    updateLineLogistics,
    recalculateShipDates,
    autoCategorizeLines,
    calculatePreview
};
