const path = require('path');
const fs = require('fs');
const knex = require('../server/src/db/knex');

async function performReset() {
    console.log('--- STARTING SUPER RESET ---');

    try {
        // 1. Clear Database Tables
        const tables = [
            'documents',
            'document_extraction_meta',
            'document_backups',
            'extraction_batches',
            'customers',
            'custom_proposals',
            'proposal_lines',
            'doc_links',
            'transactions',
            'audit_logs',
            'dossier_nodes',
            'dossier_links',
            'dossier_node_docs'
        ];

        for (const table of tables) {
            if (await knex.schema.hasTable(table)) {
                const count = await knex(table).count('* as count').first();
                await knex(table).del();
                console.log(`[DB] Cleared ${count.count} rows from "${table}"`);
            } else {
                console.log(`[DB] Table "${table}" does not exist, skipping.`);
            }
        }

        // 2. Clean Physical Storage
        const rootDir = path.resolve(__dirname, '..');
        const uploadsDir = path.join(rootDir, 'uploads');
        const dataProjectsDir = path.join(rootDir, 'data', 'projects');

        // Clear Uploads
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            for (const file of files) {
                if (file === '.gitkeep') continue;
                const fullPath = path.join(uploadsDir, file);
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`[FS] Deleted: ${fullPath}`);
            }
        }

        // Clear Project Directories
        if (fs.existsSync(dataProjectsDir)) {
            const projects = fs.readdirSync(dataProjectsDir);
            for (const project of projects) {
                const projectPath = path.join(dataProjectsDir, project);
                if (!fs.statSync(projectPath).isDirectory()) continue;

                console.log(`[FS] Resetting project: ${project}`);

                const stagingDir = path.join(projectPath, 'staging');
                const archiveDir = path.join(projectPath, 'archive');
                const docsJson = path.join(projectPath, 'docs.json');
                const auditJson = path.join(projectPath, 'audit.json');

                if (fs.existsSync(stagingDir)) {
                    fs.readdirSync(stagingDir).forEach(f => {
                        if (f === '.gitkeep') return;
                        fs.rmSync(path.join(stagingDir, f), { recursive: true, force: true });
                    });
                    console.log(`[FS] Cleared staging for ${project}`);
                }

                if (fs.existsSync(archiveDir)) {
                    fs.readdirSync(archiveDir).forEach(f => {
                        if (f === '.gitkeep') return;
                        fs.rmSync(path.join(archiveDir, f), { recursive: true, force: true });
                    });
                    console.log(`[FS] Cleared archive for ${project}`);
                }

                if (fs.existsSync(docsJson)) {
                    fs.writeFileSync(docsJson, JSON.stringify({ rows: [] }, null, 2));
                    console.log(`[FS] Reset docs.json for ${project}`);
                }

                if (fs.existsSync(auditJson)) {
                    fs.writeFileSync(auditJson, JSON.stringify({ rows: [] }, null, 2));
                    console.log(`[FS] Reset audit.json for ${project}`);
                }
            }
        }

        console.log('--- RESET COMPLETE ---');
    } catch (err) {
        console.error('--- RESET FAILED ---');
        console.error(err);
    } finally {
        await knex.destroy();
        process.exit(0);
    }
}

performReset();
