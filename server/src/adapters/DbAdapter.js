// server/src/adapters/DbAdapter.js

/**
 * Interface for Database Adapters
 */
class DbAdapter {
    async init() { throw new Error('Not implemented'); }

    // Documents
    async getDocuments(projectId, filters) { throw new Error('Not implemented'); }
    async getDocumentById(projectId, id) { throw new Error('Not implemented'); }
    async saveDocument(projectId, doc) { throw new Error('Not implemented'); }
    async updateDocument(projectId, id, updates) { throw new Error('Not implemented'); }
    async deleteDocument(projectId, id) { throw new Error('Not implemented'); }
    async bulkDelete(projectId, ids) { throw new Error('Not implemented'); }

    // Audit
    async logAudit(projectId, entry) { throw new Error('Not implemented'); }
    async getAudit(projectId, filters) { throw new Error('Not implemented'); }

    // Batch / Progress (Optional if using DB for progress)
    async saveProgress(batchId, progress) { throw new Error('Not implemented'); }
    async getProgress(batchId) { throw new Error('Not implemented'); }
}

module.exports = DbAdapter;
