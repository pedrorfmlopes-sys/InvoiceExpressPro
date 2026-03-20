const fs = require('fs');
const path = require('path');
const Adapter = require('../../storage/getDocsAdapter');
const ProjectService = require('../../services/ProjectService');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const knex = require('../../db/knex');
const { sanitize, coercePartyToString } = require('../../utils/helpers');
const CustomerService = require('../crm/CustomerService');

/**
 * UniversalDocService
 * Master service for all document operations (Legacy + V2).
 * Ensures atomic transactions and cross-storage consistency.
 */
class UniversalDocService {

    async getDoc(project, id, trx = null) {
        return await Adapter.getDoc(project, id, trx);
    }

    async getDocs(project, filters = {}, trx = null) {
        return await Adapter.getDocs(project, filters, trx);
    }

    async updateDoc(project, id, patch, trx = null) {
        if (patch.supplier) patch.supplier = coercePartyToString(patch.supplier);
        if (patch.customer) patch.customer = coercePartyToString(patch.customer);

        const updated = await Adapter.updateDoc(project, id, patch, trx);

        // Phase 11: Proactive CRM Sync on manual update
        const hasCustomerInfo = patch.customer ||
            (patch.entities && patch.entities.customer) ||
            (patch.rawJson && patch.rawJson.entities && patch.rawJson.entities.customer);

        if (hasCustomerInfo) {
            try {
                // We use the full updated doc to ensure we have name + vat
                const fullDoc = await Adapter.getDoc(project, id, trx);
                await CustomerService.upsertFromExtraction(project, fullDoc, false, trx);
                console.log(`[CRM] Proactive sync for doc ${id}${trx ? ' [TRX]' : ''}`);
            } catch (crmErr) {
                console.warn(`[CRM] Proactive sync failed for doc ${id}:`, crmErr.message);
            }
        }

        return updated;
    }

    async deleteDoc(project, id, trx = null) {
        const db = trx || knex;
        const doc = await Adapter.getDoc(project, id, db);
        if (!doc) return false;

        await Adapter.deleteDoc(project, id, db);

        // File cleanup
        if (doc.filePath && fs.existsSync(doc.filePath)) {
            try { fs.unlinkSync(doc.filePath); } catch { }
        }

        await Adapter.appendAudit(project, { action: 'delete_one', id }, db);
        return true;
    }

    /**
     * finalizeDoc
     * The single, authoritative way to move a document to the archive.
     */
    async finalizeDoc(project, { id, docType, docNumber, force, backupReason }, trx = null) {
        const work = async (innerTrx) => {
            // 1. Fetch & Validate
            const doc = await Adapter.getDoc(project, id, innerTrx);
            if (!doc) throw new Error('Document not found');
            if (doc.status === 'processado' && !force) throw new Error('Document already finalized');
            if (!doc.filePath || !fs.existsSync(doc.filePath)) throw new Error('Source file missing in staging');

            // 2. Resolve final values (Smart Adapter already merged satellite into 'doc'!)
            const finalType = (docType || doc.docType || '').trim();
            const finalNumber = (docNumber || doc.docNumber || '').trim();
            const finalSupplier = (doc.supplier && typeof doc.supplier === 'object') ? doc.supplier.name : doc.supplier;

            if (!finalType) throw new Error('Type (fatura/proforma/etc) required');
            if (!finalNumber) throw new Error('Document number required');

            // 3. Conflict Detection
            const conflicts = await innerTrx('documents')
                .where({ project, docNumber: finalNumber, supplier: finalSupplier, docType: finalType })
                .whereNot({ id })
                .select('*');

            if (conflicts.length > 0) {
                if (!force) {
                    const error = new Error('Já existe um documento igual no arquivo');
                    error.conflict = true;
                    error.existing = conflicts;
                    error.pending = doc; // Include the current pending doc metadata
                    throw error;
                }

                // Force: Backup and Delete Conflicts
                for (const c of conflicts) {
                    const snapshot = { ... (c.rawJson ? JSON.parse(c.rawJson) : {}), ...c };
                    await Adapter.createBackup(project, c.id, snapshot, backupReason || 'Overwrite during finalization', innerTrx);

                    // Migrate history chain
                    await innerTrx('document_backups')
                        .where({ original_doc_id: c.id })
                        .update({ original_doc_id: id });

                    // Phase 21: Migrate Proposals that were cloned from this doc
                    await innerTrx('custom_proposals')
                        .where({ original_doc_id: c.id })
                        .update({ original_doc_id: id });

                    // Phase 21: Migrate Fulfillments linked to this doc
                    await innerTrx('proposal_fulfillments')
                        .where({ document_id: c.id })
                        .update({ document_id: id });

                    // Phase 21: Migrate Manual Links
                    await innerTrx('doc_links')
                        .where({ doc_id: c.id })
                        .update({ doc_id: id });

                    await Adapter.deleteDoc(project, c.id, innerTrx);
                }
            }

            // 4. File System Operation
            const ctx = ProjectService.getContext(project);
            const now = new Date();
            const archiveDir = path.join(ctx.dirs.archive, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
            if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

            const destName = `${sanitize(finalType)}-${sanitize(finalNumber)}.pdf`;
            const destPath = path.join(archiveDir, destName);

            if (doc.filePath !== destPath) {
                // If destination exists but we are here (force=true), remove old file first
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                fs.renameSync(doc.filePath, destPath);
            }

            // 5. Database Commit (Transparently handled by Adapter)
            const updates = {
                docType: finalType,
                docNumber: finalNumber,
                status: 'processado',
                filePath: destPath,
                size: fs.statSync(destPath).size,
                updatedAt: new Date()
            };

            // Phase 36: Capture Customer Data (Non-destructive)
            try {
                await CustomerService.upsertFromExtraction(project, doc, false, innerTrx);
            } catch (e) {
                console.error('[CRM] Failed to capture customer during finalization:', e.message);
            }

            const updated = await Adapter.updateDoc(project, id, updates, innerTrx);
            await Adapter.appendAudit(project, { action: 'finalize', id, docType: finalType, docNumber: finalNumber }, innerTrx);

            return updated;
        };

        if (trx) return await work(trx);
        return await knex.transaction(work);
    }

    async finalizeBulk(project, items, options = {}) {
        const results = [];
        const { force, backupReason } = options;
        for (const it of items) {
            try {
                // Merge options into individual item if not present
                const effectiveItem = { ...it };
                if (force !== undefined && effectiveItem.force === undefined) effectiveItem.force = force;
                if (backupReason !== undefined && effectiveItem.backupReason === undefined) effectiveItem.backupReason = backupReason;

                const r = await this.finalizeDoc(project, effectiveItem);
                results.push({ id: it.id, ok: true, row: r });
            } catch (e) {
                results.push({
                    id: it.id,
                    ok: false,
                    error: e.message,
                    conflict: e.conflict,
                    existing: e.existing,
                    pending: e.pending
                });
            }
        }
        return results;
    }
}

module.exports = new UniversalDocService();
