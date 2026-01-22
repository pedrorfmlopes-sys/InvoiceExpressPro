const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class LabelsService {
    // -- Manage Labels --

    async getLabels(projectId, filters = {}) {
        // Returns Labels where project IS NULL (Global) OR project = projectId
        // project can be 'ALL' to see everything (e.g. admin view) or specific.
        const q = knex('labels');

        const mk = projectId || filters.project; // Use either

        if (mk && mk !== 'ALL') {
            q.where(b => {
                b.where('project', mk).orWhereNull('project');
            });
        }

        // Filter Archivation
        if (filters.archived === 'true') {
            q.where('archived', true);
        } else if (filters.archived === 'all') {
            // No filter
        } else {
            q.where('archived', false);
        }

        return q.orderBy('name', 'asc');
    }

    async createLabel(data) {
        // data: { project, name, color, icon_type, icon_value, created_by }
        // Validation: Unique Name in Project scope
        const { project, name } = data;

        // 1. Check Uniqueness
        // If project is provided, check (project=p AND name=n).
        // If project is null/undefined (Global), check (project IS NULL AND name=n).

        const q = knex('labels').where('name', name);
        if (project) {
            q.where('project', project);
        } else {
            q.whereNull('project');
        }

        const existing = await q.first();
        if (existing) {
            throw new Error(`Label '${name}' already exists in this scope.`);
        }

        const id = uuidv4();
        // Insert
        await knex('labels').insert({
            id,
            project: project || null,
            name,
            color: data.color || null,
            icon_type: data.icon_type || 'library',
            icon_value: data.icon_value || null,
            created_by: data.created_by,
            archived: false
        });

        return this.findById(id);
    }

    async findById(id) {
        return knex('labels').where({ id }).first();
    }

    async updateLabel(id, updates) {
        // Check if name update causes collision? Omitted for brevity but recommended.
        // Simple update
        await knex('labels').where({ id }).update({
            ...updates,
            updated_at: new Date()
        });
        return this.findById(id);
    }

    async deleteLabel(id) {
        // Soft delete (archive)
        return this.updateLabel(id, { archived: true });
    }

    // -- Assign to Docs --

    async getDocLabels(docId) {
        return knex('document_labels')
            .join('labels', 'document_labels.label_id', 'labels.id')
            .where('document_labels.doc_id', docId)
            .select('labels.*');
    }

    async setDocLabels(docId, labelIds) { // labelIds is Array<string>
        if (!Array.isArray(labelIds)) throw new Error('labelIds must be an array');

        // 1. Verify Doc Exists & Get Project
        const doc = await knex('documents').where('id', docId).select('project', 'id').first();
        if (!doc) throw new Error('Document not found');

        // 2. Verify Labels
        if (labelIds.length > 0) {
            const labels = await knex('labels').whereIn('id', labelIds);

            // Check count
            if (labels.length !== labelIds.length) throw new Error('One or more labels not found');

            // Validate Rules
            for (const lbl of labels) {
                // Rule 1: Not Archived (unless already attached? No, setting new set implies active choice)
                if (lbl.archived) throw new Error(`Label '${lbl.name}' is archived.`);

                // Rule 2: Scope Match
                // Label must be GLOBAL (project null) OR match Doc Project
                if (lbl.project && lbl.project !== doc.project) {
                    throw new Error(`Label '${lbl.name}' belongs to project '${lbl.project}', cannot assign to doc in '${doc.project}'.`);
                }
            }
        }

        // 3. Replace Links (Transaction recommended)
        await knex.transaction(async trx => {
            // Remove old
            await trx('document_labels').where('doc_id', docId).del();

            // Insert new
            if (labelIds.length > 0) {
                const inserts = labelIds.map(lid => ({
                    doc_id: docId,
                    label_id: lid
                }));
                await trx('document_labels').insert(inserts);
            }
        });

        return this.getDocLabels(docId);
    }

    // -- Assign to Nodes --

    async getNodeLabels(nodeId) {
        return knex('dossier_node_labels')
            .join('labels', 'dossier_node_labels.label_id', 'labels.id')
            .where('dossier_node_labels.node_id', nodeId)
            .select('labels.*');
    }

    async setNodeLabels(nodeId, labelIds) { // labelIds is Array<string>
        if (!Array.isArray(labelIds)) throw new Error('labelIds must be an array');

        // 1. Verify Node Exists optional, FK handles it? No, explicit check better for error msg.
        const node = await knex('dossier_nodes').where('id', nodeId).first();
        if (!node) throw new Error('Node not found');

        // 2. Verify Labels
        if (labelIds.length > 0) {
            const labels = await knex('labels').whereIn('id', labelIds);
            if (labels.length !== labelIds.length) throw new Error('One or more labels not found');
            // Rules: Not Archived
            for (const lbl of labels) {
                if (lbl.archived && !lbl.allow_archived_usage) throw new Error(`Label '${lbl.name}' is archived.`);
            }
        }

        // 3. Replace Links
        await knex.transaction(async trx => {
            await trx('dossier_node_labels').where('node_id', nodeId).del();
            if (labelIds.length > 0) {
                const inserts = labelIds.map(lid => ({
                    id: uuidv4(),
                    node_id: nodeId,
                    label_id: lid
                }));
                await trx('dossier_node_labels').insert(inserts);
            }
        });

        return this.getNodeLabels(nodeId);
    }
}

module.exports = new LabelsService();
