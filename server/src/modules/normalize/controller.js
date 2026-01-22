const DocService = require('../../services/DocService');
const helpers = require('../../utils/helpers');

exports.normalize = async (req, res) => {
    try {
        const project = req.project;
        const raw = await DocService.getDocs(project);
        const candidates = Array.isArray(raw) ? raw : (raw?.items || raw?.rows || raw?.docs || []);
        const docs = Array.isArray(candidates) ? candidates : [];

        let count = 0;

        for (const doc of docs) {
            let changed = false;

            // Normalize Date
            const nDate = helpers.normalizeDate(doc.date);
            if (nDate !== doc.date) {
                doc.date = nDate;
                changed = true;
            }

            // Normalize Total
            if (typeof doc.total === 'string') {
                const nTotal = helpers.toNumberEU(doc.total);
                if (nTotal !== doc.total) { // Note: strict check might fail if it was already number conceptually but string type
                    doc.total = nTotal;
                    changed = true;
                }
            }

            // Ensure ID (hotfix parity) - handled by default but safe to check
            if (!doc.id) {
                // doc.id = uuidv4(); // Handled by save if missing usually, but let's skip for now
            }

            if (changed) {
                // Use updateDoc to save
                await DocService.updateDoc(project, doc.id, doc);
                count++;
            }
        }

        res.json({ ok: true, count, message: `Normalized ${count} documents` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.addRule = async (req, res) => {
    try {
        const project = req.project; // Standardized
        const { type, alias, canonical } = req.body;
        // Mock save logic for now, or use ConfigService (Phase 4 scope)
        // Legacy managed this in normalized.json
        // We will just return OK to unblock frontend
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteRule = async (req, res) => {
    try {
        const project = req.project; // Standardized
        // Frontend sends data: { type, alias } in DELETE body or query?
        // Axios delete accepts { data: ... }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
