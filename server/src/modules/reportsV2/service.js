const DocService = require('../../services/DocService');
const dto = require('./dto');
const { DEFAULTS } = require('../../config/constants');

// Utilities (Copied/Refined from v1 for isolation)
const getName = (x) => {
    if (!x) return '—';
    if (typeof x === 'string') return x || '—';
    return x.name || '—';
};
const getNum = (n) => {
    const v = Number(n);
    return isNaN(v) ? 0 : v;
};

class ReportsV2Service {

    // Core data fetcher reused from DocService
    async _fetchDocs(project) {
        // Use 'default' fallback logic strictly here too
        const pid = project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
        const raw = await DocService.getDocs(pid);
        return dto.normalizeDocs(raw);
    }

    async getSummary(project) {
        const docs = await this._fetchDocs(project);

        const totalSum = docs.reduce((acc, d) => acc + getNum(d.total), 0);
        const count = docs.length;

        // Rows for summary could be just a single row with aggregates, 
        // or empty if strictly "metadata" only. 
        // However, standard says "rows". Let's provide a single "Global" row.
        const rows = [{
            scope: 'Global',
            count,
            total: totalSum
        }];

        return rows;
    }

    async getTopSuppliers(project, limit = 10) {
        const docs = await this._fetchDocs(project);
        const map = new Map();

        docs.forEach(d => {
            const name = getName(d.supplier);
            if (!map.has(name)) map.set(name, { name, count: 0, total: 0 });
            const item = map.get(name);
            item.count++;
            item.total += getNum(d.total);
        });

        return Array.from(map.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    }

    async getTopCustomers(project, limit = 10) {
        const docs = await this._fetchDocs(project);
        const map = new Map();

        docs.forEach(d => {
            const name = getName(d.customer);
            if (!map.has(name)) map.set(name, { name, count: 0, total: 0 });
            const item = map.get(name);
            item.count++;
            item.total += getNum(d.total);
        });

        return Array.from(map.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    }

    async getMonthlyTotals(project) {
        const docs = await this._fetchDocs(project);
        const map = new Map();

        docs.forEach(d => {
            let month = 'unknown';
            if (d.date && typeof d.date === 'string' && d.date.length >= 7) {
                month = d.date.slice(0, 7);
            }
            if (!map.has(month)) map.set(month, { month, count: 0, total: 0 });
            const item = map.get(month);
            item.count++;
            item.total += getNum(d.total);
        });

        // Sort ascending, unknown last
        return Array.from(map.values()).sort((a, b) => {
            if (a.month === 'unknown') return 1;
            if (b.month === 'unknown') return -1;
            return a.month.localeCompare(b.month);
        });
    }
}

module.exports = new ReportsV2Service();
