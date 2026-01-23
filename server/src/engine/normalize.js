function normalizeAmount(str) {
    if (!str) return null;
    // Remove currency symbols and spaces
    let clean = str.replace(/[€$£]/g, '').trim();

    // Check format: 1.234,56 (EU) vs 1,234.56 (US)
    // Heuristic: if last punctuation is comma, it's decimal (EU)
    // If last punctuation is dot, it's decimal (US) - unless there are multiple dots 1.234.567

    if (clean.includes(',') && clean.includes('.')) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            // 1.234,56 -> EU
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // 1,234.56 -> US
            clean = clean.replace(/,/g, '');
        }
    } else if (clean.includes(',')) {
        // 1234,56 or 1,234 (could be ambiguous, prefer decimal comma if 2 digits after)
        if (clean.match(/,\d{2}$/)) {
            clean = clean.replace(',', '.');
        } else {
            // 1,234 -> might be choulland separator. Dangerous. 
            // Assume EU context for now: users said "Pt/Es/It", so comma is decimal usually.
            clean = clean.replace(',', '.');
        }
    }

    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function normalizeDate(str) {
    if (!str) return null;
    // Try YYYY-MM-DD
    let m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

    // Try DD/MM/YYYY
    m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;

    return null;
}

module.exports = {
    normalizeAmount,
    normalizeDate
};
