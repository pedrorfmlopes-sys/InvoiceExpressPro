const DEFAULT_COMMENT_STYLE = Object.freeze({
    variant: 'note',
    fontSize: 11,
    color: '#CBD5E1',
    bold: false,
    italic: true
});

const COMMENT_VARIANTS = new Set(['title', 'subtitle', 'note']);

function safeParseJson(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toFiniteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
    const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeHexColor(value) {
    const raw = String(value || '').trim();
    if (/^#([0-9a-f]{6})$/i.test(raw)) return raw.toUpperCase();
    if (/^#([0-9a-f]{3})$/i.test(raw)) {
        const [, hex] = raw.match(/^#([0-9a-f]{3})$/i);
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
    }
    return DEFAULT_COMMENT_STYLE.color;
}

function normalizeCommentStyle(style) {
    const merged = { ...DEFAULT_COMMENT_STYLE, ...(style || {}) };
    const variant = String(merged.variant || '').trim().toLowerCase();
    return {
        variant: COMMENT_VARIANTS.has(variant) ? variant : DEFAULT_COMMENT_STYLE.variant,
        fontSize: Math.max(9, Math.min(24, Math.round(toFiniteNumber(merged.fontSize, DEFAULT_COMMENT_STYLE.fontSize)))),
        color: normalizeHexColor(merged.color),
        bold: !!merged.bold,
        italic: !!merged.italic
    };
}

function inferProposalLineType(line) {
    const explicitType = String(line?.line_type || '').trim().toLowerCase();
    if (explicitType === 'comment' || explicitType === 'item') return explicitType;

    const sku = String(line?.sku ?? line?.code ?? '').trim();
    const description = String(line?.description || '').trim();
    const qty = toFiniteNumber(line?.quantity, Number.NaN);
    const price = toFiniteNumber(line?.unit_price_commercial ?? line?.unitPrice ?? line?.price, Number.NaN);

    if (!sku && description && (!Number.isFinite(qty) || qty === 0) && (!Number.isFinite(price) || price === 0)) {
        return 'comment';
    }

    return 'item';
}

function isCommentLine(line) {
    return inferProposalLineType(line) === 'comment';
}

function normalizeExtraAttributes(extra, lineType) {
    const parsed = safeParseJson(extra, {}) || {};
    if (lineType === 'comment') {
        parsed.comment_style = normalizeCommentStyle(parsed.comment_style);
    } else if (parsed.comment_style) {
        delete parsed.comment_style;
    }
    return parsed;
}

function normalizeDateValue(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeProposalLineInput(line, options = {}) {
    const lineType = inferProposalLineType(line);
    const extra = normalizeExtraAttributes(line?.extra_attributes, lineType);
    const sku = lineType === 'comment' ? '' : String(line?.sku ?? line?.code ?? '').trim();
    const description = String(line?.description || '').replace(/\r\n/g, '\n').trimEnd();
    const defaultItemQuantity = options.defaultItemQuantity ?? 0;
    const factoryPriceInput = line?.unit_price_factory ?? line?.price ?? line?.unitPrice ?? 0;
    const commercialPriceInput = line?.unit_price_commercial ?? line?.price ?? line?.unitPrice ?? factoryPriceInput;
    const isComment = lineType === 'comment';

    return {
        proposal_id: options.proposalId,
        line_type: lineType,
        sku,
        description,
        quantity: isComment ? 0 : toFiniteNumber(line?.quantity, defaultItemQuantity),
        unit_price_factory: isComment ? 0 : toFiniteNumber(factoryPriceInput, 0),
        unit_price_commercial: isComment ? 0 : toFiniteNumber(commercialPriceInput, toFiniteNumber(factoryPriceInput, 0)),
        discount_factory: String(line?.discount_factory ?? line?.discountPercent ?? line?.discountText ?? '0'),
        discount_commercial_percent: isComment ? 0 : toFiniteNumber(line?.discount_commercial_percent, 0),
        vat_rate: String(line?.vat_rate ?? line?.vat ?? line?.vatRate ?? options.defaultVatRate ?? '23'),
        sort_order: options.sortOrder ?? 0,
        lead_time_weeks: isComment ? null : (line?.lead_time_weeks === '' || line?.lead_time_weeks === undefined || line?.lead_time_weeks === null ? null : toFiniteNumber(line.lead_time_weeks, null)),
        predicted_ship_date: isComment ? null : normalizeDateValue(line?.predicted_ship_date),
        is_manual_override: !!line?.is_manual_override,
        production_category: isComment ? null : (line?.production_category || null),
        extra_attributes: JSON.stringify(extra),
        updated_at: new Date()
    };
}

function normalizeStoredProposalLine(line) {
    const lineType = inferProposalLineType(line);
    const extra = normalizeExtraAttributes(line?.extra_attributes, lineType);
    const normalized = {
        ...line,
        line_type: lineType,
        sku: lineType === 'comment' ? '' : String(line?.sku || '').trim(),
        discount_factory: lineType === 'comment' ? '0' : String(line?.discount_factory ?? '0'),
        quantity: lineType === 'comment' ? 0 : toFiniteNumber(line?.quantity, 0),
        unit_price_factory: lineType === 'comment' ? 0 : toFiniteNumber(line?.unit_price_factory, 0),
        unit_price_commercial: lineType === 'comment' ? 0 : toFiniteNumber(line?.unit_price_commercial, 0),
        discount_commercial_percent: lineType === 'comment' ? 0 : toFiniteNumber(line?.discount_commercial_percent, 0),
        vat_rate: String(line?.vat_rate ?? '23'),
        extra_attributes: extra
    };

    if (lineType === 'comment') {
        normalized.lead_time_weeks = null;
        normalized.predicted_ship_date = null;
        normalized.production_category = null;
    }

    return normalized;
}

function calculateProposalLineAmounts(line) {
    const normalized = normalizeStoredProposalLine(line);
    if (normalized.line_type === 'comment') {
        return { normalized, lineNet: 0, lineVat: 0, totalWithVat: 0 };
    }

    const lineNet = normalized.quantity * normalized.unit_price_commercial * (1 - (normalized.discount_commercial_percent / 100));
    const vatRate = toFiniteNumber(normalized.vat_rate, 23);
    const lineVat = lineNet * (vatRate / 100);
    return {
        normalized,
        lineNet,
        lineVat,
        totalWithVat: lineNet + lineVat
    };
}

function calculateProposalMetrics(lines = []) {
    return lines.reduce((acc, rawLine) => {
        const { normalized, totalWithVat } = calculateProposalLineAmounts(rawLine);
        acc.totalAmount += totalWithVat;

        if (normalized.line_type !== 'comment' && normalized.predicted_ship_date) {
            const shipDate = new Date(normalized.predicted_ship_date);
            if (!Number.isNaN(shipDate.getTime())) {
                const iso = shipDate.toISOString();
                if (!acc.maxShipDate || iso > acc.maxShipDate) acc.maxShipDate = iso;
            }
        }

        return acc;
    }, { totalAmount: 0, maxShipDate: null });
}

module.exports = {
    DEFAULT_COMMENT_STYLE,
    safeParseJson,
    toFiniteNumber,
    normalizeCommentStyle,
    inferProposalLineType,
    isCommentLine,
    normalizeProposalLineInput,
    normalizeStoredProposalLine,
    calculateProposalLineAmounts,
    calculateProposalMetrics
};
