/**
 * ZipHelper
 * Infer country and context from zip code patterns.
 */
class ZipHelper {
    /**
     * Detects country code based on zip pattern.
     * @param {string} zip 
     * @returns {string|null} Returns ISO country code (e.g. 'PT', 'IT', 'ES') or null
     */
    getCountryFromZip(zip) {
        if (!zip) return null;
        const clean = zip.trim();

        // Portugal: XXXX-XXX
        if (/^\d{4}-\d{3}$/.test(clean)) return 'PT';

        // Italy: 5 digits (often 28010, etc)
        if (/^\d{5}$/.test(clean)) {
            // High probability of Italy for certain prefixes if in Nicolazzi context, 
            // but generically it could be Spain or France too.
            // For now, return a generic 'EU' or most likely candidate if we have more context.
            return 'EU';
        }

        return null;
    }

    /**
     * Attempts to extract a VAT prefix candidate from a full address string.
     */
    inferCountryFromAddress(address) {
        if (!address) return null;
        const upper = address.toUpperCase();

        if (upper.includes('PORTUGAL')) return 'PT';
        if (upper.includes('ITALIA') || upper.includes('ITALY')) return 'IT';
        if (upper.includes('ESPAÑA') || upper.includes('SPAIN')) return 'ES';
        if (upper.includes('FRANCE')) return 'FR';

        // Search for CP patterns
        // Portugal: XXXX-XXX
        if (/\b\d{4}-\d{3}\b/.test(address)) return 'PT';

        // Italy/Spain: 5 digits
        // We look for a 5 digit number that isn't part of a larger number
        const fiveDigitMatch = address.match(/\b\d{5}\b/);
        if (fiveDigitMatch) {
            // Context heuristic: If it's a Nicolazzi doc (which we often handle), it's likely IT.
            // Generically, we'll return 'EU' or use the most common one for the project.
            // For now, let's look for common Italian province codes like (NO), (MI), (ROMA)
            if (/\((NO|MI|RM|TO|VE|FI)\)/i.test(address) || / Italia$/i.test(address)) return 'IT';
            return 'EU';
        }

        return null;
    }
}

module.exports = new ZipHelper();
