/**
 * Standardizes API responses for Reports V2.
 * Contract: { meta: {...}, filters: {...}, rows: [...] }
 */

exports.toResponse = (rows = [], filters = {}, meta = {}) => {
    // Safety: ensure rows is always an array
    const safeRows = Array.isArray(rows) ? rows : [];

    return {
        meta: {
            timestamp: new Date().toISOString(),
            count: safeRows.length,
            ...meta
        },
        filters: {
            ...filters
        },
        rows: safeRows
    };
};

exports.normalizeDocs = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.rows)) return raw.rows;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.docs)) return raw.docs;
    return [];
};
