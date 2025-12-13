const DocService = require('../services/DocService');
const xlsx = require('xlsx');

exports.exportXlsx = async (req, res) => {
    try {
        const project = req.query.project;
        const docs = await DocService.getDocs(project);

        // Transform for Export
        const rows = docs.map(d => ({
            ID: d.id,
            Type: d.docType,
            Number: d.docNumber,
            Date: d.date,
            Supplier: typeof d.supplier === 'object' ? d.supplier.name : d.supplier,
            Total: d.total,
            Status: d.status,
            File: d.origName || ''
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, "Docs");

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=export-${Date.now()}.xlsx`);
        res.send(buffer);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
};
