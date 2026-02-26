/**
 * Parses a cascading discount string (e.g., "40+10+5") and computes the final multiplier.
 * For "40+10", the multiplier is (1 - 0.40) * (1 - 0.10) = 0.54.
 * Returns 1.0 if no valid discount.
 */
export function getDiscountMultiplier(discountStr) {
    if (!discountStr) return 1;

    // Support previous float numbers like 40 or "40"
    if (typeof discountStr === 'number') {
        return Math.max(0, 1 - (discountStr / 100));
    }

    const str = discountStr.toString().trim();
    if (str === '') return 1;

    // Split by '+' (and allow spaces)
    const parts = str.split('+');
    let multiplier = 1;

    for (const p of parts) {
        const val = parseFloat(p.trim().replace('%', '').replace(',', '.'));
        if (!isNaN(val) && val >= 0) {
            multiplier *= Math.max(0, 1 - (val / 100));
        }
    }

    return multiplier;
}

/**
 * Calculates the net price after applying the cascading discount.
 */
export function applyDiscount(price, discountStr) {
    const p = parseFloat(price || 0);
    const m = getDiscountMultiplier(discountStr);
    return Math.max(0, p * m); // Never negative
}

/**
 * Normalizes the string to a readable format (e.g., "40+5" becomes "40% + 5%").
 */
export function formatDiscountDisplay(discountStr) {
    if (!discountStr) return '';
    const str = discountStr.toString().trim();
    if (str === '0' || str === '') return '';

    const parts = str.split('+');
    const valid = parts
        .map(p => parseFloat(p.trim().replace('%', '').replace(',', '.')))
        .filter(val => !isNaN(val) && val > 0);

    if (valid.length === 0) return '';
    if (valid.length === 1) return `${valid[0]}%`;

    return valid.map(v => `${v}%`).join(' + ');
}
