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

  async finalizeDoc(projectId, { id, docType, docNumber }) {
    const doc = await Adapter.getDoc(projectId, id);
    if (!doc) throw new Error('not found');

    const finalType = (docType || doc.docType || '').trim();
    const finalNumber = (docNumber || doc.docNumber || '').trim();

    if (!finalType) throw new Error('docType required');
    if (!finalNumber) throw new Error('docNumber vazio');

    // Check duplicates
    const all = await Adapter.getDocs(projectId);
    const dup = all.find(r =>
      r.id !== id &&
      r.status === 'processado' &&
      String(r.docType || '').toLowerCase() === String(finalType).toLowerCase() &&
      String(r.docNumber || '').toLowerCase() === String(finalNumber).toLowerCase()
    );
    if (dup) throw new Error('Documento duplicado');

    if (!doc.filePath || !fs.existsSync(doc.filePath)) throw new Error('staging file missing');

    const ctx = ProjectService.getContext(projectId);
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const outDir = path.join(ctx.dirs.archive, yyyy, mm);

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const destName = `${sanitize(finalType)}-${sanitize(finalNumber)}.pdf`;
    const destPath = path.join(outDir, destName);

    if (fs.existsSync(destPath)) throw new Error('Já existe ficheiro igual no arquivo');

    fs.renameSync(doc.filePath, destPath);

    const updates = {
      docType: finalType,
      docNumber: finalNumber,
      status: 'processado',
      filePath: destPath,
      size: fs.statSync(destPath).size,
      updatedAt: new Date()
    };

    const updated = await Adapter.updateDoc(projectId, id, updates);
    if (Adapter.appendAudit) {
      await Adapter.appendAudit(projectId, { action: 'finalize', id, docType: finalType, docNumber: finalNumber });
    }

    return updated;
  }
}

module.exports = new DocService();
