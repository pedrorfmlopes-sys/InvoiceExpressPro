
const axios = require('axios');

class SmartLookupService {
    constructor() {
        // VIES (VAT) - Using a public JSON wrapper or direct SOAP if needed. 
        // For MVP, we can use a reliable public wrapper or implement SOAP. 
        // https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number (Official REST API)
        this.VIES_API = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

        // Nominatim (Name/Address) - OpenStreetMap
        this.NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
    }

    async lookup(query) {
        if (!query) return null;
        const cleanQuery = query.trim();

        // 1. Detect if it's a NIF/VAT (starts with 2 letters or just digits, length 9-14)
        // Simple regex for NIF candidates (PT 9 digits, or generic)
        const isNifCandidate = /^(?:[A-Z]{2})?\s*\d{9,12}$/i.test(cleanQuery);

        if (isNifCandidate) {
            return await this.lookupByVat(cleanQuery);
        } else {
            return await this.lookupByName(cleanQuery);
        }
    }

    async lookupByVat(vatInput) {
        try {
            // Clean VAT
            let countryCode = 'PT'; // Default to PT if no prefix
            let vatNumber = vatInput.replace(/[^0-9A-Z]/gi, '').toUpperCase();

            // Extract country if present
            const countryMatch = vatNumber.match(/^([A-Z]{2})/);
            if (countryMatch) {
                countryCode = countryMatch[1];
                vatNumber = vatNumber.substring(2);
            }

            // VIES Request
            // Official REST API payload
            const payload = {
                countryCode: countryCode,
                vatNumber: vatNumber
            };

            const res = await axios.post(this.VIES_API, payload);
            const data = res.data;

            if (data.valid) {
                // Determine address (VIES format varies)
                let address = data.address || '';
                // Clean up VIES address which is often messy
                address = address.replace(/\n/g, ', ').trim();

                return {
                    source: 'VIES',
                    formattedParams: {
                        name: data.name,
                        vat: `${countryCode}${vatNumber}`,
                        address: address,
                        isValid: true
                    },
                    raw: data
                };
            }
            return null; // Invalid or not found
        } catch (e) {
            console.error('[SmartLookup] VAT Lookup failed:', e.message);
            return null;
        }
    }

    async lookupByName(nameInput) {
        try {
            // Nominatim Request
            // User Agent is required by Nominatim policy
            const res = await axios.get(this.NOMINATIM_API, {
                headers: { 'User-Agent': 'InvoiceStudio/1.0' },
                params: {
                    q: nameInput,
                    format: 'json',
                    addressdetails: 1,
                    limit: 3,
                    countrycodes: 'pt' // Bias to PT? Or generic? User is PT based.
                }
            });

            if (res.data && res.data.length > 0) {
                // Refine results: prefer 'amenity', 'shop', 'office'
                // Take the first one for now
                const best = res.data[0];

                // Format Address
                // Nominatim address object: road, city, postcode, country...
                const addr = best.address || {};
                const formattedAddress = [
                    addr.road,
                    addr.house_number,
                    addr.postcode,
                    addr.city || addr.town || addr.village,
                    addr.country
                ].filter(Boolean).join(', ');

                return {
                    source: 'Nominatim',
                    formattedParams: {
                        name: best.name || nameInput, // Sometimes name is missing in result
                        address: formattedAddress,
                        // Nominatim doesn't give VAT or Phone/Email usually
                    },
                    raw: best
                };
            }
            return null;
        } catch (e) {
            console.error('[SmartLookup] Name Lookup failed:', e.message);
            return null;
        }
    }
}

module.exports = new SmartLookupService();
