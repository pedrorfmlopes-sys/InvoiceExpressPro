const DocService = require('../../services/DocService'); // Ensure DocService shim is used or direct module import if prefered.
const xlsx = require('xlsx');

exports.exportXlsx = async (req, res) => {
    try {
        // Standardized project
        // Fallback for context safety
        const project = req.project || 'default';

        console.log('[Export] Generating for project:', project);

        const raw = await DocService.getDocs(project);

        // Normalize: adapter might return Array or { items: Array, ... }
        const docs =
            Array.isArray(raw) ? raw :
                Array.isArray(raw?.items) ? raw.items :
                    Array.isArray(raw?.rows) ? raw.rows :
                        Array.isArray(raw?.docs) ? raw.docs :
                            [];

        if (
            !Array.isArray(raw) &&
            !Array.isArray(raw?.items) &&
            !Array.isArray(raw?.rows) &&
            !Array.isArray(raw?.docs)
        ) {
            console.warn('[exportXlsx] Unexpected docs shape', raw);
        }

        if (docs.length === 0) {
            // Return empty XLSX (safe UX)
        }

        // Transform for Export
        const rows = docs.map(d => ({
            ID: d.id,
            Type: d.docType,
            Number: d.docNumber,
            Date: d.date,
            Supplier: (d.supplier && typeof d.supplier === 'object') ? (d.supplier.name || '') : (d.supplier || ''),
            Customer: (d.customer && typeof d.customer === 'object') ? (d.customer.name || '') : (d.customer || ''),
            Total: d.total,
            Status: d.status,
            File: d.origName || ''
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, "Docs");

        // Perf: Stream via Temp File to avoid large RAM Buffer
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const tmpPath = path.join(os.tmpdir(), `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`);

        // Write to disk (xlsx still builds WB in ram, but we avoid the double hit of Buffer allocation)
        xlsx.writeFile(wb, tmpPath);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=export-${Date.now()}.xlsx`);

        const stream = fs.createReadStream(tmpPath);
        stream.pipe(res);

        // Cleanup
        stream.on('close', () => { fs.unlink(tmpPath, () => { }); });
        stream.on('error', () => { fs.unlink(tmpPath, () => { }); });
        res.on('finish', () => { fs.unlink(tmpPath, () => { }); }); // Fail-safe

    } catch (e) {
        console.error('[Export Error] Stack:', e.stack);
        console.error('[Export Error] Message:', e.message);
        res.status(500).json({ error: e.message });
    }
};
