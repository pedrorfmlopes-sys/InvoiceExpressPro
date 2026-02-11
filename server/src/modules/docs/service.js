// server/src/services/DocService.js
const fs = require('fs');
const path = require('path');
const Adapter = require('../../storage/getDocsAdapter');
const ProjectService = require('../../services/ProjectService');
const { sanitize, normalizeDate, coercePartyToString } = require('../../utils/helpers');

class DocService {
  async getDocs(projectId, filters) {
    return await Adapter.getDocs(projectId, filters);
  }

  async searchDocs(projectId, q) {
    if (!q) return [];
    const res = await Adapter.getDocs(projectId);
    const all = Array.isArray(res) ? res : (res.rows || []);
    const lower = q.toLowerCase();
    // Filter by invoice_no, supplier, docNumber, or id
    return all.filter(d =>
      (d.invoice_no && String(d.invoice_no).toLowerCase().includes(lower)) ||
      (d.supplier && String(d.supplier).toLowerCase().includes(lower)) ||
      (d.docNumber && String(d.docNumber).toLowerCase().includes(lower)) ||
      (d.docType && String(d.docType).toLowerCase().includes(lower))
    ).slice(0, 50);
  }

  async getDoc(projectId, id) {
    return await Adapter.getDoc(projectId, id);
  }

  async updateDoc(projectId, id, updates) {
    if (updates.supplier) updates.supplier = coercePartyToString(updates.supplier);
    if (updates.customer) updates.customer = coercePartyToString(updates.customer);

    return await Adapter.updateDoc(projectId, id, updates);
  }

  async saveDocument(projectId, doc) {
    return await Adapter.saveDocument(projectId, doc);
  }

  async deleteDoc(projectId, id) {
    const doc = await Adapter.getDoc(projectId, id);
    if (!doc) return false;

    await Adapter.deleteDoc(projectId, id);

    // File cleanup logic (kept in Service for now)
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try { fs.unlinkSync(doc.filePath); } catch { }
    }

    if (Adapter.appendAudit) {
      await Adapter.appendAudit(projectId, { action: 'delete_one', id });
    }
    return true;
  }

  async finalizeDoc(projectId, { id, docType, docNumber }, options = {}) {
    const { force = false, trx = null } = options;
    // Pass trx to getDoc to avoid pool exhaustion in transactions
    const doc = await Adapter.getDoc(projectId, id, trx);
    if (!doc) throw new Error('not found');

    const finalType = (docType || doc.docType || '').trim();
    const finalNumber = (docNumber || doc.docNumber || '').trim();

    if (!finalType) throw new Error('docType required');
    if (!finalNumber) throw new Error('docNumber vazio');

    // Check duplicates (unless forced)
    if (!options.force) {
      // Pass trx to getDocs
      const res = await Adapter.getDocs(projectId, {}, trx);
      const all = Array.isArray(res) ? res : (res.rows || []);
      const dup = all.find(r =>
        r.id !== id &&
        r.status === 'processado' &&
        String(r.docType || '').toLowerCase() === String(finalType).toLowerCase() &&
        String(r.docNumber || '').toLowerCase() === String(finalNumber).toLowerCase()
      );
      if (dup) throw new Error('Documento duplicado');
    }

    if (!doc.filePath || !fs.existsSync(doc.filePath)) throw new Error('staging file missing');

    const ctx = ProjectService.getContext(projectId);
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const outDir = path.join(ctx.dirs.archive, yyyy, mm);

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const destName = `${sanitize(finalType)}-${sanitize(finalNumber)}.pdf`;
    const destPath = path.join(outDir, destName);

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (doc.filePath === destPath) {
      console.log(`[Finalize] File already at destination: ${destPath}`);
    } else {
      if (fs.existsSync(destPath) && !force) throw new Error('Já existe ficheiro igual no arquivo');

      // Move or Copy (Overwrite if forced)
      if (force && fs.existsSync(destPath)) {
        fs.unlinkSync(destPath); // Remove existing to allow move
        console.log(`[Finalize] Forced overwrite of ${destPath}`);
      }
      fs.renameSync(doc.filePath, destPath);
    }

    const updates = {
      docType: finalType,
      docNumber: finalNumber,
      status: 'processado',
      filePath: destPath,
      size: fs.statSync(destPath).size,
      updatedAt: new Date()
    };

    // --- CONSOLIDATION: Merge Satellite data into Main DB (rawJson) ---
    try {
      const SatelliteStorage = require('../../storage/SatelliteStorage');
      console.log(`[Consolidation] Check: doc.id=${id}, supplier=${JSON.stringify(doc.supplier)}, finalType=${finalType}`);

      // Determine satellite name (standard pattern)
      let satName = null;

      // Handle supplier being either a string or an object with a 'name' property
      const supplierName = (doc.supplier && typeof doc.supplier === 'object')
        ? (doc.supplier.name || '')
        : (doc.supplier || '');

      const supplierUpper = String(supplierName).toUpperCase();
      const typeLower = String(finalType).toLowerCase();

      console.log(`[Consolidation] Resolved: supplierUpper='${supplierUpper}', typeLower='${typeLower}'`);

      if (supplierUpper.includes('NICOLAZZI') && typeLower === 'proforma') {
        satName = 'nicolazzi_proformas';
      } else if (supplierUpper.includes('NICOLAZZI') && typeLower === 'fatura') {
        satName = 'nicolazzi_invoices';
      }

      console.log(`[Consolidation] satName result: ${satName}`);

      if (satName) {
        const satData = await SatelliteStorage.getData(satName, id);
        if (satData) {
          // Phase 17: PROTECT canonical fields from satellite overwrite
          // This prevents status reverting to 'staging' after finalization
          const { status, docType, docNumber, ...safeSatData } = satData;
          Object.assign(updates, safeSatData);
          console.log(`[Consolidation] Merged satellite '${satName}' fields into doc ${id} (Status Protected)`);
        }
      }
    } catch (e) {
      console.warn(`[Consolidation] Failed to merge satellite data for doc ${id}:`, e.message);
    }
    // -----------------------------------------------------------------

    const updated = await Adapter.updateDoc(projectId, id, updates, trx);
    if (Adapter.appendAudit) {
      await Adapter.appendAudit(projectId, { action: 'finalize', id, docType: finalType, docNumber: finalNumber }, trx);
    }

    return updated;
  }
}

module.exports = new DocService();
