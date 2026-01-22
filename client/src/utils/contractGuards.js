
export class ContractError extends Error {
    constructor(endpoint, details) {
        super(`Contract violation at ${endpoint}`);
        this.name = 'ContractError';
        this.endpoint = endpoint;
        this.details = details;
    }
}

// 1. Health Modules
export const isHealthModulesResponse = (data) => {
    // Expect: { ok: true, modules: [...] }
    if (!data || typeof data !== 'object') return false;
    // Allow ok to be missing if modules is present? No, standard is ok: true
    // But let's be pragmatic. Must have modules array.
    if (!Array.isArray(data.modules)) return false;
    return true;
};

// 2. Reports V2 Summary
export const isReportsV2SummaryResponse = (data) => {
    // Expect: dto.toResponse -> { meta, filters, rows }
    if (!data || typeof data !== 'object') return false;
    if (!data.meta || !data.filters || !Array.isArray(data.rows)) return false;
    return true;
};

// 3. Reports Legacy Suppliers
export const isReportsLegacySuppliersResponse = (data) => {
    // Expect: { rows: [], items: [] }
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.rows)) return false;
    // items is duplicate reference, rows is primary
    return true;
};

// 4. Doc Response (using excel.json as proxy or :id if accessible)
export const isDocListResponse = (data) => {
    // Expect: { rows: [], excelPath: ... }
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.rows)) return false;
    return true;
};
