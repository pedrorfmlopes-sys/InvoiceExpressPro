const fs = require('fs');
const path = require('path');
const { PATHS } = require('../config/constants');
const knex = require('./knex');
const ProjectService = require('../services/ProjectService');
const { v4: uuidv4 } = require('uuid');

async function run() {
    console.log('[Import] Starting Migration from JSON to DB...');
    let importedDocs = 0;
    let importedRules = 0;
    let importedAudit = 0;
    const failures = [];

    // Check if DB is empty
    try {
        const count = await knex('documents').count('id as c').first();
        if (count.c > 0) {
            console.log('[Import] DB not empty. Skipping.');
            process.exit(0);
        }
    } catch {
        // Table might not exist, ensure migrations ran
        console.log('[Import] Tables missing? Run npm run db:migrate first.');
        process.exit(1);
    }

    const projects = ProjectService.listProjects();
    for (const p of projects) {
        console.log(`[Import] Processing project: ${p}`);
        const ctx = ProjectService.getContext(p);

        // 1. Docs
        if (fs.existsSync(ctx.files.docs)) {
            try {
                const data = JSON.parse(fs.readFileSync(ctx.files.docs, 'utf8'));
                const rows = data.rows || [];
                const dbRows = rows.map(r => ({
                    id: r.id || uuidv4(),
                    project: p,
                    batchId: r.batchId || 'legacy-import',
                    docType: r.docType,
                    docNumber: r.docNumber,
                    supplier: typeof r.supplier === 'object' ? r.supplier.name : r.supplier,
                    customer: typeof r.customer === 'object' ? r.customer.name : r.customer,
                    date: r.date,
                    dueDate: r.dueDate,
                    total: r.total,
                    status: r.status || 'staging',
                    filePath: r.filePath,
                    rawJson: JSON.stringify(r),
                    created_at: new Date(),
                    updated_at: new Date()
                }));

                // Batch insert
                if (dbRows.length > 0) {
                    await knex('documents').insert(dbRows);
                    importedDocs += dbRows.length;
                }
            } catch (e) {
                failures.push({ project: p, type: 'docs', error: e.message });
            }
        }

        // 2. Normalize Rules
        if (ctx.files.normalize && fs.existsSync(ctx.files.normalize)) {
            try {
                const rules = JSON.parse(fs.readFileSync(ctx.files.normalize, 'utf8'));
                // Assuming array or specific structure? Legacy `normalization.json` usually { supplier: {...}, customer: {...} } or array?
                // Let's assume array of rules based on typical legacy. Use heuristics if not standard.
                // If it's the standard structure we built in previous phases: { rules: [...] }
                const list = Array.isArray(rules) ? rules : (rules.rules || []);

                const dbRules = list.map(r => ({
                    project: p,
                    kind: r.kind || 'supplier',
                    alias: r.alias,
                    canonical: r.canonical,
                    created_at: new Date(),
                    updated_at: new Date()
                }));
                if (dbRules.length > 0) {
                    await knex('normalize_rules').insert(dbRules);
                    importedRules += dbRules.length;
                }
            } catch (e) {
                failures.push({ project: p, type: 'rules', error: e.message });
            }
        }

        // 3. Audit
        if (ctx.files.audit && fs.existsSync(ctx.files.audit)) {
            try {
                // Might be NDJSON or JSON array
                const raw = fs.readFileSync(ctx.files.audit, 'utf8');
                let logs = [];
                try {
                    logs = JSON.parse(raw);
                    if (!Array.isArray(logs)) logs = [logs];
                } catch {
                    logs = raw.split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
                }

                const dbLogs = logs.map(l => ({
                    project: p,
                    ts: l.ts || new Date().toISOString(),
                    action: l.action || 'unknown',
                    payloadJson: JSON.stringify(l)
                }));

                if (dbLogs.length > 0) {
                    await knex('audit_logs').insert(dbLogs);
                    importedAudit += dbLogs.length;
                }
            } catch (e) {
                failures.push({ project: p, type: 'audit', error: e.message });
            }
        }
    }

    const report = `
MIGRATION REPORT
================
Date: ${new Date().toISOString()}
Imported Docs: ${importedDocs}
Imported Rules: ${importedRules}
Imported Audit: ${importedAudit}

Failures:
${failures.map(f => `- [${f.project}] ${f.type}: ${f.error}`).join('\n')}
`;
    fs.writeFileSync('MIGRATION_REPORT.txt', report.trim());
    console.log(report);
    process.exit(0);
}

run();
