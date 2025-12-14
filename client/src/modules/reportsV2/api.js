import { qp, downloadFile } from '../../shared/ui';
import api from '../../api/apiClient';

// V2 Reports API Client
// Note: We reuse 'downloadFile' from shared UI for consistency but wrap endpoints here.

const BASE = '/api/v2/reports';

export const ReportsV2Api = {

    getSummary: async (project) => {
        const res = await api.get(qp(`${BASE}/summary`, project));
        return res.data; // { meta, filters, rows }
    },

    getTopSuppliers: async (project, topN = 10) => {
        const u = new URL(`${BASE}/top-suppliers`, window.location.origin);
        if (project) u.searchParams.set('project', project);
        u.searchParams.set('topN', topN);
        const res = await api.get(u.pathname + u.search);
        return res.data;
    },

    getTopCustomers: async (project, topN = 10) => {
        const u = new URL(`${BASE}/top-customers`, window.location.origin);
        if (project) u.searchParams.set('project', project);
        u.searchParams.set('topN', topN);
        const res = await api.get(u.pathname + u.search);
        return res.data;
    },

    getMonthlyTotals: async (project) => {
        const res = await api.get(qp(`${BASE}/monthly-totals`, project));
        return res.data;
    },

    downloadExport: (project, format = 'xlsx') => {
        // Reuse export V1 logic but mounted on V2
        // We can just use the download helper directly
        const u = `${BASE}/export`;
        downloadFile(qp(u, project), `reports_v2.${format}`);
    },

    downloadPdfBasic: (project) => {
        // Post request typically for PDF generation if body needed, but our V1/V2 Basic is GET/POST agnostic for now
        // Controller is defined as POST /pdf
        // downloadFile uses POST by default if body present? 
        // Our shared/ui.jsx downloadFile helper defaults to POST if body provided, 
        // but here we might want just a link or trigger download.
        // Let's use downloadFile helper which supports axios config or fetch logic
        downloadFile(qp(`${BASE}/pdf`, project), 'relatorio_v2.pdf', {}, 'POST'); // Empty body
    }
};
