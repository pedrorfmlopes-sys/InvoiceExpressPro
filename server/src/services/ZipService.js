const archiver = require('archiver');
const TransactionsService = require('./TransactionsService');
const DbDocsAdapter = require('../storage/DbDocsAdapter');
const fs = require('fs');
const path = require('path');

class ZipService {
    async createTransactionZip(orgId, project, transactionId, res) {
        const transaction = await TransactionsService.get({ orgId, project, id: transactionId });
        if (!transaction) throw new Error('Transaction not found');

        const archive = archiver('zip', { zlib: { level: 9 } });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="transaction-${transactionId}.zip"`);

        archive.pipe(res);

        // Manifest
        const manifest = {
            transaction: {
                id: transaction.id,
                title: transaction.title,
                status: transaction.status,
                counterparty: transaction.counterparty,
                created: transaction.created_at,
                updated: transaction.updated_at
            },
            documents: []
        };

        // Add Docs
        for (const link of transaction.links) {
            // Get full doc
            const doc = await DbDocsAdapter.getDoc(project, link.documentId);
            if (!doc) continue;

            const safeName = `${doc.docType || 'doc'}_${doc.docNumber || '000'}_${doc.id.substring(0, 8)}.pdf`.replace(/[^a-z0-9\._-]/gi, '_');

            // Add to zip
            if (doc.filePath && fs.existsSync(doc.filePath)) {
                archive.file(doc.filePath, { name: safeName });
            } else {
                // Missing file placeholder?
                archive.append(`File missing: ${doc.filePath}`, { name: `${safeName}.txt` });
            }

            manifest.documents.push({
                ...link,
                docNumber: doc.docNumber,
                total: doc.total,
                date: doc.date,
                fileName: safeName
            });
        }

        // Add Manifest
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        await archive.finalize();
    }
}

module.exports = new ZipService();
