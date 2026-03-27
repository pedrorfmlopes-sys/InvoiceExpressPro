import { applyDiscount } from './utils/DiscountEngine';

export const DEFAULT_COMMENT_STYLE = Object.freeze({
    variant: 'note',
    fontSize: 11,
    color: '#CBD5E1',
    bold: false,
    italic: true
});

const COMMENT_VARIANTS = new Set(['title', 'subtitle', 'note']);

export function toFiniteNumber(value, fallback = 0) {
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

export function normalizeCommentStyle(style) {
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

export function inferProposalLineType(line) {
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

export function isCommentLine(line) {
    return inferProposalLineType(line) === 'comment';
}

export function normalizeLineForUi(line) {
    const lineType = inferProposalLineType(line);
    const extra = typeof line?.extra_attributes === 'string'
        ? (() => {
            try { return JSON.parse(line.extra_attributes || '{}'); } catch { return {}; }
        })()
        : (line?.extra_attributes || {});

    const nextExtra = { ...extra };
    if (lineType === 'comment') {
        nextExtra.comment_style = normalizeCommentStyle(nextExtra.comment_style);
    } else if (nextExtra.comment_style) {
        delete nextExtra.comment_style;
    }

    return {
        ...line,
        line_type: lineType,
        sku: lineType === 'comment' ? '' : (line?.sku || ''),
        quantity: lineType === 'comment' ? 0 : toFiniteNumber(line?.quantity, 0),
        unit_price_factory: lineType === 'comment' ? 0 : toFiniteNumber(line?.unit_price_factory, 0),
        unit_price_commercial: lineType === 'comment' ? 0 : toFiniteNumber(line?.unit_price_commercial, 0),
        discount_commercial_percent: lineType === 'comment' ? 0 : toFiniteNumber(line?.discount_commercial_percent, 0),
        extra_attributes: nextExtra
    };
}

export function createItemLine() {
    return {
        id: `new-${Math.random().toString(36).slice(2, 11)}`,
        line_type: 'item',
        sku: '',
        description: '',
        quantity: 1,
        unit_price_factory: 0,
        unit_price_commercial: 0,
        discount_commercial_percent: 0,
        vat_rate: '23',
        extra_attributes: {}
    };
}

export function createCommentLine() {
    return {
        id: `new-${Math.random().toString(36).slice(2, 11)}`,
        line_type: 'comment',
        sku: '',
        description: '',
        quantity: 0,
        unit_price_factory: 0,
        unit_price_commercial: 0,
        discount_commercial_percent: 0,
        vat_rate: '23',
        extra_attributes: {
            comment_style: { ...DEFAULT_COMMENT_STYLE }
        }
    };
}

export function getCommentRowClass(style) {
    const variant = normalizeCommentStyle(style).variant;
    if (variant === 'title') return 'text-white uppercase tracking-[0.2em]';
    if (variant === 'subtitle') return 'text-sky-200 uppercase tracking-[0.12em]';
    return 'text-slate-200';
}

export function getCommentPreviewStyle(style) {
    const normalized = normalizeCommentStyle(style);
    return {
        color: normalized.color,
        fontSize: `${normalized.fontSize}px`,
        fontWeight: normalized.bold ? 700 : 400,
        fontStyle: normalized.italic ? 'italic' : 'normal'
    };
}

export function calculateLineAmounts(line) {
    const normalized = normalizeLineForUi(line);
    if (normalized.line_type === 'comment') {
        return { normalized, lineNet: 0, lineVat: 0, totalWithVat: 0 };
    }

    const lineNet = normalized.quantity * applyDiscount(normalized.unit_price_commercial, normalized.discount_commercial_percent || '0');
    const vatRate = toFiniteNumber(normalized.vat_rate, 23);
    const lineVat = lineNet * (vatRate / 100);
    return {
        normalized,
        lineNet,
        lineVat,
        totalWithVat: lineNet + lineVat
    };
}
