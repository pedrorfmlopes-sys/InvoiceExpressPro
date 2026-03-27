/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasTable = await knex.schema.hasTable('proposal_lines');
    if (!hasTable) return;

    const hasLineType = await knex.schema.hasColumn('proposal_lines', 'line_type');
    if (!hasLineType) {
        await knex.schema.table('proposal_lines', table => {
            table.string('line_type').notNullable().defaultTo('item');
        });
    }

    const rows = await knex('proposal_lines').select(
        'id',
        'sku',
        'description',
        'quantity',
        'unit_price_factory',
        'unit_price_commercial',
        'discount_commercial_percent',
        'extra_attributes',
        'line_type'
    );

    for (const row of rows) {
        const sku = String(row.sku || '').trim();
        const description = String(row.description || '').trim();
        const qty = Number.parseFloat(row.quantity);
        const unitPriceFactory = Number.parseFloat(row.unit_price_factory);
        const unitPriceCommercial = Number.parseFloat(row.unit_price_commercial);
        const discountCommercial = Number.parseFloat(row.discount_commercial_percent);
        const explicitType = String(row.line_type || '').trim().toLowerCase();
        const looksLikeComment = explicitType === 'comment'
            || (!sku && description && (!Number.isFinite(qty) || qty === 0) && (!Number.isFinite(unitPriceCommercial) || unitPriceCommercial === 0));

        let extra = {};
        if (row.extra_attributes) {
            try {
                extra = typeof row.extra_attributes === 'object'
                    ? row.extra_attributes
                    : JSON.parse(row.extra_attributes);
            } catch {
                extra = {};
            }
        }

        if (looksLikeComment) {
            extra.comment_style = {
                variant: 'note',
                fontSize: 11,
                color: '#CBD5E1',
                bold: false,
                italic: true,
                ...(extra.comment_style || {})
            };

            await knex('proposal_lines')
                .where({ id: row.id })
                .update({
                    line_type: 'comment',
                    sku: '',
                    discount_factory: '0',
                    quantity: 0,
                    unit_price_factory: 0,
                    unit_price_commercial: 0,
                    discount_commercial_percent: 0,
                    extra_attributes: JSON.stringify(extra)
                });
        } else if (explicitType !== 'item') {
            await knex('proposal_lines')
                .where({ id: row.id })
                .update({
                    line_type: 'item',
                    quantity: Number.isFinite(qty) ? qty : 0,
                    unit_price_factory: Number.isFinite(unitPriceFactory) ? unitPriceFactory : 0,
                    unit_price_commercial: Number.isFinite(unitPriceCommercial) ? unitPriceCommercial : 0,
                    discount_commercial_percent: Number.isFinite(discountCommercial) ? discountCommercial : 0
                });
        }
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    const hasTable = await knex.schema.hasTable('proposal_lines');
    if (!hasTable) return;

    const hasLineType = await knex.schema.hasColumn('proposal_lines', 'line_type');
    if (hasLineType) {
        await knex.schema.table('proposal_lines', table => {
            table.dropColumn('line_type');
        });
    }
};
