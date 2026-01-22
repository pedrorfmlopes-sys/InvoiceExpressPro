const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');

class ExplorerService {
    // -- Docs --
    async getDocs(projectId, params = {}) {
        const {
            limit = 50, cursor = 0, q,
            archived, sub_project_id, category_id, scope,
            supplier, customer, docType, hasLinks,
            dateStart, dateEnd,
            sort = 'date', sortDir = 'desc'
        } = params;
        const offset = parseInt(cursor);

        // Base Query with Link Count
        let query = knex('documents')
            .select('documents.*')
            .select(knex.raw('(SELECT COUNT(*) FROM doc_links WHERE doc_links.group_id IN (SELECT group_id FROM doc_links as dl2 WHERE dl2.doc_id = documents.id)) as linkRawCount')) // Raw count of all docs in my groups
        // Note: linkRawCount includes SELF. So linkCount = linkRawCount - 1 (if > 0). Or just use raw logic in UI.
        // Actually, easier: Count how many groups I am in? No, we link docs by putting them in same group.
        // A doc is in 1 group usually. 
        // Let's simplified: count how many OTHER docs share a group with me.
        // (SELECT COUNT(*) - 1 FROM doc_links WHERE group_id IN (...)) is hard in subquery.
        // Let's just Return raw count of rows in my group. If 1, it's just me (unlinked). If > 1, linked.

        // Project Filter
        if (projectId && projectId !== 'ALL') {
            query.where('documents.project', projectId);
        }

        // Filters
        if (archived === 'true') query.where('documents.archived', true);
        else if (archived === 'false') query.where(b => b.where('documents.archived', false).orWhereNull('documents.archived'));
        // 'all' = no filter

        if (sub_project_id) query.where('sub_project_id', sub_project_id);
        if (category_id) query.where('category_id', category_id);
        if (scope) query.where('scope', scope);
        if (docType) query.where('docType', docType);
        if (supplier) query.where('supplier', 'like', `%${supplier}%`);
        if (customer) query.where('customer', 'like', `%${customer}%`);

        if (dateStart) query.where('date', '>=', dateStart);
        if (dateEnd) query.where('date', '<=', dateEnd);

        if (hasLinks === 'true') {
            // Docs that exist in doc_links table (naive) or have > 1 members in their group
            // Simplest: exists in doc_links
            query.whereExists(function () {
                this.select('*').from('doc_links').whereRaw('doc_links.doc_id = documents.id');
            });
        } else if (hasLinks === 'false') {
            query.whereNotExists(function () {
                this.select('*').from('doc_links').whereRaw('doc_links.doc_id = documents.id');
            });
        }

        // Search
        if (q) {
            const term = `%${q}%`;
            query.where(builder => {
                builder.where('supplier', 'like', term)
                    .orWhere('customer', 'like', term)
                    .orWhere('docNumber', 'like', term)
                    .orWhere('total', 'like', term);
            });
        }

        // Sorting
        // sort field whitelist to prevent injection
        const allowedSorts = ['date', 'created_at', 'total', 'docNumber', 'supplier'];
        const safeSort = allowedSorts.includes(sort) ? sort : 'date';
        const safeDir = ['asc', 'desc'].includes(sortDir) ? sortDir : 'desc';
        query.orderBy(safeSort, safeDir);

        // Pagination
        query.limit(limit).offset(offset);

        const rows = await query;

        // Post-process rows to normalize linkCount
        const processed = rows.map(r => {
            // linkRawCount is count of ALL entries in the group including self.
            // If I am in a group of 1, I am basically unlinked (unless I am linked to myself? No).
            // Wait, if I am NOT in doc_links, count is 0.
            // If I am in doc_links (single entry), count is 1. (Valid group of 1? orphaned?)
            // Real links imply >= 2.
            // So displayed linkCount = max(0, linkRawCount - 1) ?
            // Actually, if I created a link group with just 1 doc (waiting for another), it is technically in a group.
            // But usually we link 2 docs.
            // Let's send raw and let UI decide.
            // Actually, the subquery `SELECT group_id FROM doc_links WHERE doc_id = documents.id` might return multiple groups?
            // Schema says PK is (group_id, doc_id). A doc can be in multiple groups?
            // "linkDocs" service implementation: upserts to a specific group.
            // A doc *could* be in multiple groups theoretically.
            // Let's assume 1 main group for now or simple count of ANY relation.
            const c = r.linkRawCount || 0;
            // If c > 1, undoubtedly linked. If c=1, just me in a group. If c=0, no group.
            // Let's treat count as "Number of OTHER docs connected".
            return { ...r, linkCount: c > 0 ? c - 1 : 0 };
        });

        return { rows: processed, nextCursor: offset + processed.length };
    }

    async updateDoc(id, projectId, updates) {
        // Security check
        const q = knex('documents').where({ id });
        if (projectId && projectId !== 'ALL') q.where({ project: projectId });

        // Whitelist updates
        const allowed = ['sub_project_id', 'category_id', 'scope', 'archived', 'notes', 'total', 'docNumber', 'date', 'supplier', 'customer', 'docType'];
        const cleanUpdates = {};
        for (const k of allowed) {
            if (updates[k] !== undefined) cleanUpdates[k] = updates[k];
        }

        if (Object.keys(cleanUpdates).length === 0) return null;

        await q.update({ ...cleanUpdates, updated_at: new Date() });
        return knex('documents').where({ id }).first();
    }

    async deleteDocs(docIds) {
        if (!docIds || !docIds.length) return;
        // Cleanup dependencies first (FKs)
        await knex('doc_links').whereIn('doc_id', docIds).del();
        await knex('transaction_links').whereIn('documentId', docIds).del();
        await knex('documents').whereIn('id', docIds).del();
    }

    // -- Links --
    async linkDocs(docIds, groupIdArg) {
        if (!docIds || docIds.length === 0) throw new Error("No docs");

        const groupId = groupIdArg || uuidv4();

        // Upsert links
        // We use INSERT OR IGNORE logic or simply insert
        const inserts = docIds.map(docId => ({
            group_id: groupId,
            doc_id: docId,
            metadata: JSON.stringify({ type: 'rel' })
        }));

        await knex('doc_links').insert(inserts).onConflict(['group_id', 'doc_id']).ignore();

        return { groupId };
    }

    async getLinks(docId) {
        // 1. Find groups this doc belongs to
        const groups = await knex('doc_links').where({ doc_id: docId }).select('group_id');
        if (groups.length === 0) return [];

        const groupIds = groups.map(g => g.group_id);

        // 2. Find all docs in those groups
        const links = await knex('doc_links')
            .join('documents', 'doc_links.doc_id', 'documents.id')
            .whereIn('doc_links.group_id', groupIds)
            .whereNot('documents.id', docId) // Exclude self
            .select(
                'documents.id', 'documents.project', 'documents.docType',
                'documents.docNumber', 'documents.date', 'documents.total',
                'doc_links.group_id'
            );

        return links;
    }

    async unlinkDoc(docId, groupId) {
        await knex('doc_links').where({ doc_id: docId, group_id: groupId }).del();
        // Cleanup: If group has < 2 items, maybe delete the other one too? 
        // Or if group has 0 items?
        // Let's leave it simple: delete the link. 
        // If a group has 1 item left, it's effectively unlinked anyway (linkCount checks for peers).
        return true;
    }

    // -- Aux --
    async getSubProjects(projectId) {
        let q = knex('sub_projects');
        if (projectId === 'ALL') {
            // Return all? Or just globals? Assuming ALL means everything accessible
            // logic: where project IS NULL
        } else {
            q.where(b => b.where('project', projectId).orWhereNull('project'));
        }
        return await q;
    }

    async createSubProject(data) {
        const id = uuidv4();
        await knex('sub_projects').insert({ id, ...data });
        return await knex('sub_projects').where({ id }).first();
    }

    async getCategories(projectId) {
        let q = knex('doc_categories');
        if (projectId && projectId !== 'ALL') {
            q.where(b => b.where('project', projectId).orWhereNull('project'));
        }
        return await q;
    }

    async createCategory(data) {
        const id = uuidv4();
        await knex('doc_categories').insert({ id, ...data });
        return await knex('doc_categories').where({ id }).first();
    }

    // -- Prefs --
    async getPrefs(userId, project, key) {
        const res = await knex('user_preferences')
            .where({ user_id: userId, key })
            .where(b => {
                if (project) b.where('project', project);
                else b.whereNull('project');
            })
            .first();
        return res ? JSON.parse(res.value) : null;
    }

    async setPrefs(userId, project, key, value) {
        // Upsert
        // Sqlite upsert: insert into ... on conflict do update
        const valStr = JSON.stringify(value);

        // Clean up project (handle 'null' string vs null value if needed, assuming null)
        const projVal = project === 'GLOBAL' ? null : project;

        await knex('user_preferences').insert({
            user_id: userId,
            project: projVal,
            key,
            value: valStr
        }).onConflict(['user_id', 'project', 'key']).merge();

        return value;
    }
}

module.exports = new ExplorerService();
