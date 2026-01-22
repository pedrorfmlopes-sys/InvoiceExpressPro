const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class DossierService {

    // -- Nodes --

    async createNode(data) {
        const id = uuidv4();
        await knex('dossier_nodes').insert({
            id,
            parent_id: data.parent_id || null, // Ensure explicit null if undefined
            name: data.name,
            code: data.code || null,
            description: data.description || null,
            created_by: data.created_by,
            archived: false
        });
        return this.getNode(id);
    }

    async getNode(id) {
        return knex('dossier_nodes').where({ id }).first();
    }

    async updateNode(id, updates) {
        // Handle style JSON serialization for SQLite
        if (updates.style && typeof updates.style === 'object') {
            updates.style = JSON.stringify(updates.style);
        }

        await knex('dossier_nodes').where({ id }).update({
            ...updates,
            updated_at: new Date()
        });
        return this.getNode(id);
    }

    async deleteNode(id) {
        // Or archive? User requested /archive. 
        // This method strictly deletes.
        // If we delete, we should handle children.
        // Logic: Typically archive.
        // Keeping logical delete for now via updateNode({ archived: true }).
    }

    async listNodes(filter = {}) {
        const q = knex('dossier_nodes');

        if (filter.parentId !== undefined) {
            if (filter.parentId === 'null' || filter.parentId === null) q.whereNull('parent_id');
            else q.where('parent_id', filter.parentId);
        }

        if (filter.archived !== undefined && filter.archived !== 'all') {
            q.where('archived', filter.archived === 'true' || filter.archived === true);
        }

        if (filter.q) {
            q.where(b => {
                b.whereLike('name', `%${filter.q}%`)
                    .orWhereLike('code', `%${filter.q}%`)
                    .orWhereLike('custom_1', `%${filter.q}%`)
                    .orWhereLike('custom_2', `%${filter.q}%`);
            });
        }

        const nodes = await q.orderBy('created_at', 'desc');

        if (nodes.length > 0) {
            const nodeIds = nodes.map(n => n.id);

            // 1. Get Labels
            const rawLabels = await knex('dossier_node_labels')
                .join('labels', 'dossier_node_labels.label_id', 'labels.id')
                .whereIn('dossier_node_labels.node_id', nodeIds)
                .select('dossier_node_labels.node_id', 'labels.id', 'labels.name', 'labels.color', 'labels.icon_type', 'labels.icon_value');

            const labelMap = {};
            for (const row of rawLabels) {
                if (!labelMap[row.node_id]) labelMap[row.node_id] = [];
                const { node_id, ...lbl } = row;
                labelMap[row.node_id].push(lbl);
            }

            // 2. Get Doc Counts
            const docCounts = await knex('document_dossier_nodes')
                .whereIn('node_id', nodeIds)
                .groupBy('node_id')
                .count('doc_id as count')
                .select('node_id');
            const docCountMap = {};
            docCounts.forEach(r => docCountMap[r.node_id] = r.count);

            // 3. Get Child Counts (Subprojects)
            const childCounts = await knex('dossier_nodes')
                .whereIn('parent_id', nodeIds)
                .groupBy('parent_id')
                .count('id as count')
                .select('parent_id');
            const childCountMap = {};
            childCounts.forEach(r => childCountMap[r.parent_id] = r.count);

            // Merge
            for (const node of nodes) {
                node.labels = labelMap[node.id] || [];
                node.doc_count = docCountMap[node.id] || 0;
                node.child_count = childCountMap[node.id] || 0;
            }
        }

        return nodes;
    }

    async getPath(id) {
        // Recursive parent lookup up to root
        const path = [];
        let curr = await this.getNode(id);
        while (curr) {
            path.unshift(curr); // Add to front
            if (!curr.parent_id) break;
            curr = await this.getNode(curr.parent_id);
        }
        return path;
    }

    async moveNode(id, newParentId) {
        // 1. Cycle Detection
        // If newParentId is child of id (or id itself), BLOCK.

        if (id === newParentId) throw new Error("Cannot move node into itself.");

        if (newParentId) {
            // Check ancestry of newParentId
            // If 'id' appears in the ancestry of 'newParentId', then 'newParentId' is a descendant of 'id'.
            // Moving 'id' into 'newParentId' would create a cycle.

            let parentToCheck = await this.getNode(newParentId);
            while (parentToCheck) {
                if (parentToCheck.id === id) {
                    throw new Error("Cycle detected: cannot move node into its own descendant.");
                }
                if (!parentToCheck.parent_id) break;
                parentToCheck = await this.getNode(parentToCheck.parent_id);
            }
        }

        // 2. Perform Move
        await knex('dossier_nodes').where({ id }).update({
            parent_id: newParentId || null,
            updated_at: new Date()
        });

        return this.getNode(id);
    }

    // -- Links --

    async getLinks(nodeId) {
        // Get outgoing and incoming
        // Standardize output: { direction: 'out'|'in', node: ..., type: ... }

        const outLinks = await knex('dossier_links')
            .join('dossier_nodes', 'dossier_links.to_id', 'dossier_nodes.id')
            .where('dossier_links.from_id', nodeId)
            .select('dossier_links.type', 'dossier_nodes.*');

        const inLinks = await knex('dossier_links')
            .join('dossier_nodes', 'dossier_links.from_id', 'dossier_nodes.id')
            .where('dossier_links.to_id', nodeId)
            .select('dossier_links.type', 'dossier_nodes.*');

        return { out: outLinks, in: inLinks };
    }

    async addLink(from, to, type = 'related') {
        if (from === to) throw new Error("Self link not allowed");
        // Check exists
        const exists = await knex('dossier_links').where({ from_id: from, to_id: to, type }).first();
        if (exists) return exists;

        await knex('dossier_links').insert({ from_id: from, to_id: to, type });
        return { from_id: from, to_id: to, type };
    }

    async removeLink(from, to, type = 'related') {
        await knex('dossier_links').where({ from_id: from, to_id: to, type }).del();
    }

    // -- Docs --

    async getDocs(nodeId) {
        return knex('document_dossier_nodes')
            .join('documents', 'document_dossier_nodes.doc_id', 'documents.id')
            .where('document_dossier_nodes.node_id', nodeId)
            .select('documents.*');
    }

    async setDocLinks(nodeId, docIds) { // REPLACE strategy
        if (!Array.isArray(docIds)) throw new Error("docIds must be array");

        await knex.transaction(async trx => {
            // Clear old
            await trx('document_dossier_nodes').where('node_id', nodeId).del();

            // Insert new
            if (docIds.length > 0) {
                const rows = docIds.map(d => ({ doc_id: d, node_id: nodeId }));
                await trx('document_dossier_nodes').insert(rows);
            }
        });

        return this.getDocs(nodeId);
    }

    async addDocLink(nodeId, docId) {
        if (!docId) throw new Error("docId required");
        const exists = await knex('document_dossier_nodes').where({ node_id: nodeId, doc_id: docId }).first();
        if (exists) return exists;
        await knex('document_dossier_nodes').insert({ node_id: nodeId, doc_id: docId });
        return { node_id: nodeId, doc_id: docId };
    }

    async removeDocLink(nodeId, docId) {
        return knex('document_dossier_nodes').where({ node_id: nodeId, doc_id: docId }).del();
    }

    // -- Search --

    async searchNodes(q) {
        if (!q) return [];
        // Find matching nodes
        const nodes = await knex('dossier_nodes')
            .where('name', 'like', `%${q}%`)
            .orWhere('code', 'like', `%${q}%`)
            .orWhere('custom_1', 'like', `%${q}%`)
            .orWhere('custom_2', 'like', `%${q}%`)
            .limit(20);

        // Enrich with path
        const results = [];
        for (const node of nodes) {
            const path = await this.getPath(node.id); // Re-use getPath
            results.push({ ...node, path });
        }
        return results;
    }

    async searchByDoc(q) {
        if (!q) return [];
        // 1. Find docs matching Q
        const docs = await knex('documents')
            .where('invoice_no', 'like', `%${q}%`)
            .orWhere('supplier_name', 'like', `%${q}%`)
            .select('id', 'invoice_no', 'supplier_name')
            .limit(20);

        if (docs.length === 0) return [];

        // 2. Find nodes linked to these docs
        const docIds = docs.map(d => d.id);
        const links = await knex('document_dossier_nodes').whereIn('doc_id', docIds);

        // 3. Get Nodes and Enrich
        const results = [];
        for (const link of links) {
            const node = await this.getNode(link.node_id);
            if (!node) continue;
            const doc = docs.find(d => d.id === link.doc_id);
            const path = await this.getPath(node.id);
            results.push({
                type: 'doc_hit',
                node: { ...node, path },
                doc
            });
        }
        return results;
    }
}

module.exports = new DossierService();
