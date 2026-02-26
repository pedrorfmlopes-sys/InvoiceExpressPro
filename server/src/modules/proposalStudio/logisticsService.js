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
    if (rules !== undefined) updates.lead_time_rules = JSON.stringify(rules);

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
            // If manual date provided directly, set it
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
    const updates = [];

    for (const line of lines) {
        if (line.is_manual_override) continue;

        // Determine Context (Brand + Rules)
        let meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};

        // 1. Line-level Brand Override
        const lineBrandId = (meta.brand_id || meta.brand || proposal.brand_id || 'nicolazzi').toLowerCase();

        // 2. Determine Rule (Priority: Finish > Category > Collection > Global)
        const series = (meta.brand_meta?.series || meta.series || '').trim();
        const finish = (meta.finish_code || meta.finishCode || meta.brand_meta?.finishCode || '').trim();
        const cat = (line.production_category || '').trim();

        let rule = rules.find(r => finish && r.target === `finish:${finish}`) ||
            rules.find(r => cat && r.target === `category:${cat}`) ||
            rules.find(r => series && r.target === `collection:${series}`) ||
            rules.find(r => r.target === 'global');

        let leadTime;
        if (rule) {
            leadTime = { value: rule.value, unit: rule.unit };
        } else {
            // Fallback to legacy field
            leadTime = { value: line.lead_time_weeks || proposal.general_lead_time_weeks || 8, unit: 'weeks' };
        }

        // Calculate (using line-specific brand context)
        const shipDate = await calculateShipDate(startDate, leadTime, lineBrandId);

        console.log(`[Logistics] Line ${line.sku}: Brand=${lineBrandId}, Rule=${rule?.target || 'none'}, LT=${leadTime.value} ${leadTime.unit} -> ${shipDate ? shipDate.toISOString().split('T')[0] : 'NULL'}`);

        updates.push({
            id: line.id,
            predicted_ship_date: shipDate
        });
    }

    // 4. Batch Update
    for (const u of updates) {
        await knex('proposal_lines').where({ id: u.id }).update({ predicted_ship_date: u.predicted_ship_date });
    }

    return { success: true, updated: updates.length };
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
    autoCategorizeLines
};
