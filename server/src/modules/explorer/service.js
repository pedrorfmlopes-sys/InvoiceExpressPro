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
        if (params.status) query.where('status', params.status);
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
                    .orWhere('total', 'like', term)
                    .orWhereExists(function () {
                        // Search inside extracted line items explicitly stored in the database
                        this.select('*')
                            .from('document_lines')
                            .whereRaw('document_lines.document_id = documents.id')
                            .andWhere(function () {
                                this.where('document_lines.sku', 'like', term)
                                    .orWhere('document_lines.description', 'like', term);
                            });
                    })
                    .orWhere('documents.rawJson', 'like', term); // Fallback: searching directly in the rawJson blob captures lines that haven't been normalized yet
            });
        }

        // Sorting
        // sort field whitelist to prevent injection
        const allowedSorts = ['date', 'created_at', 'total', 'docNumber', 'supplier'];
        const safeSort = allowedSorts.includes(sort) ? sort : 'date';
        const safeDir = ['asc', 'desc'].includes(sortDir) ? sortDir : 'desc';
        query.orderBy(safeSort, safeDir);

        // Count Query (Clean clone before pagination)
        const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
        const totalResult = await countQuery;
        const total = parseInt(totalResult.count || totalResult['count(*)'] || 0, 10);

        // Pagination
        query.limit(limit).offset(offset);

        const rows = await query;

        // --- PHASE 21: Fetch associated proposals ---
        const docIds = rows.map(r => r.id);
        const proposalsMap = {};
        let proposalIds = [];

        if (docIds.length > 0) {
            // 1. Direct clones (via original_doc_id)
            const clonedProposals = await knex('custom_proposals')
                .whereIn('original_doc_id', docIds)
                .select('id', 'name', 'status', 'original_doc_id');

            clonedProposals.forEach(p => {
                const docId = p.original_doc_id;
                if (!proposalsMap[docId]) proposalsMap[docId] = [];
                proposalsMap[docId].push(p);
            });

            // 2. Fulfillments (linked via reconciliation)
            const fulfillmentLinks = await knex('proposal_fulfillments')
                .join('documents', 'proposal_fulfillments.document_id', 'documents.id')
                .join('proposal_lines', 'proposal_fulfillments.proposal_line_id', 'proposal_lines.id')
                .join('custom_proposals', 'proposal_lines.proposal_id', 'custom_proposals.id')
                .whereIn('proposal_fulfillments.document_id', docIds)
                .select(
                    'custom_proposals.id',
                    'custom_proposals.name',
                    'custom_proposals.status',
                    'proposal_fulfillments.document_id'
                )
                .distinct();

            fulfillmentLinks.forEach(p => {
                const docId = p.document_id;
                if (!proposalsMap[docId]) proposalsMap[docId] = [];
                // Avoid duplicates if a doc is both a clone source and has fulfillments
                if (!proposalsMap[docId].some(existing => existing.id === p.id)) {
                    proposalsMap[docId].push(p);
                }
            });

            // Enrichment: Calculate progress for each proposal across the whole batch
            const allFetchedProposals = Object.values(proposalsMap).flat();
            proposalIds = [...new Set(allFetchedProposals.map(p => p.id))];
            if (proposalIds.length > 0) {
                // Total ordered quantities per proposal
                const linesStats = await knex('proposal_lines')
                    .whereIn('proposal_id', proposalIds)
                    .groupBy('proposal_id')
                    .select('proposal_id', knex.raw('SUM(quantity) as total_qty'));

                // Total fulfilled quantities per proposal (via proposal_line_id FK)
                const fulfillStats = await knex('proposal_fulfillments')
                    .join('proposal_lines', 'proposal_fulfillments.proposal_line_id', 'proposal_lines.id')
                    .whereIn('proposal_lines.proposal_id', proposalIds)
                    .groupBy('proposal_lines.proposal_id')
                    .select('proposal_lines.proposal_id', knex.raw('SUM(proposal_fulfillments.quantity_fulfilled) as fulfilled_qty'));

                const linesMap = {};
                linesStats.forEach(s => { linesMap[s.proposal_id] = parseFloat(s.total_qty || 0); });

                const fulfillMap = {};
                fulfillStats.forEach(s => { fulfillMap[s.proposal_id] = parseFloat(s.fulfilled_qty || 0); });

                allFetchedProposals.forEach(p => {
                    const total = linesMap[p.id] || 0;
                    const fulfilled = fulfillMap[p.id] || 0;
                    p.progress = total > 0 ? Math.min(100, parseFloat(((fulfilled / total) * 100).toFixed(1))) : 0;
                });
            }
        }

        // Post-process rows to normalize linkCount and flatten rawJson
        // --- PHASE 22: Calculate total link count (including siblings) ---
        // We'll add a convenience field 'totalLinksCount' to each row
        // It's the unique set of (manual link peers + proposal links + proposal siblings)
        
        // To do this efficiently, we need the sets of doc IDs per proposal
        const propToDocs = {};
        if (proposalIds.length > 0) {
            const allpf = await knex('proposal_fulfillments')
                .whereIn('proposal_id', proposalIds)
                .select('proposal_id', 'document_id');
            allpf.forEach(pf => {
                if (!propToDocs[pf.proposal_id]) propToDocs[pf.proposal_id] = new Set();
                propToDocs[pf.proposal_id].add(pf.document_id);
            });

            // ALSO include the original source doc
            const allSources = await knex('custom_proposals')
                .whereIn('id', proposalIds)
                .whereNotNull('original_doc_id')
                .select('id', 'original_doc_id');
            allSources.forEach(s => {
                if (!propToDocs[s.id]) propToDocs[s.id] = new Set();
                propToDocs[s.id].add(s.original_doc_id);
            });
        }

        const processed = rows.map(r => {
            const { rawJson: rawStr, references_json, ...row } = r;
            let raw = {};
            try {
                raw = rawStr ? (typeof rawStr === 'string' ? JSON.parse(rawStr) : rawStr) : {};
            } catch (e) {
                console.error("[ExplorerService] Failed to parse rawJson", e);
            }

            // Calculate siblings via proposals
            const myProposals = proposalsMap[r.id] || [];
            const siblingsSet = new Set();
            myProposals.forEach(p => {
                const docsInProp = propToDocs[p.id];
                if (docsInProp) {
                    docsInProp.forEach(did => {
                        if (did !== r.id) siblingsSet.add(did);
                    });
                }
            });

            // Manual link peers (linkRawCount includes self)
            const manualPeersCount = r.linkRawCount > 0 ? r.linkRawCount - 1 : 0;
            
            // To be accurate without overcounting:
            // We take the maximum of manual peers (from doc_links) and proposal siblings (from fulfillments).
            // Usually they overlap. Then we add the count of associated proposals themselves.
            const totalLinksVal = Math.max(manualPeersCount, siblingsSet.size) + myProposals.length;

            return {
                ...raw,
                ...row,
                linkCount: manualPeersCount,
                associatedProposals: myProposals,
                totalRelatedCount: totalLinksVal,
                rawJson: raw
            };
        });

        return { rows: processed, total, nextCursor: offset + processed.length };
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
        // 1. Manual links (doc_links table)
        const manualGroups = await knex('doc_links').where({ doc_id: docId }).select('group_id');
        const manualGroupIds = manualGroups.map(g => g.group_id);

        let manualDocIds = [];
        if (manualGroupIds.length > 0) {
            manualDocIds = await knex('doc_links')
                .whereIn('group_id', manualGroupIds)
                .pluck('doc_id');
        }

        // 2. Proposal-based links (siblings from same proposals)
        // Check both as a fulfillment AND as the original source
        const fulfillmentProposals = await knex('proposal_fulfillments')
            .where('document_id', docId)
            .distinct('proposal_id')
            .pluck('proposal_id');
            
        const sourceProposals = await knex('custom_proposals')
            .where('original_doc_id', docId)
            .distinct('id')
            .pluck('id');
            
        const proposalIds = [...new Set([...fulfillmentProposals, ...sourceProposals])];
        let proposalDocIds = [];

        if (proposalIds.length > 0) {
            // Find all docs that fulfill these proposals
            const fulfillments = await knex('proposal_fulfillments')
                .whereIn('proposal_id', proposalIds)
                .distinct('document_id')
                .pluck('document_id');
            
            // AND find the original source docs for these proposals
            const sources = await knex('custom_proposals')
                .whereIn('id', proposalIds)
                .whereNotNull('original_doc_id')
                .distinct('original_doc_id')
                .pluck('original_doc_id');

            proposalDocIds = [...new Set([...fulfillments, ...sources])];
        }

        // Aggregate unique IDs excluding self
        const allIds = [...new Set([...manualDocIds, ...proposalDocIds])].filter(id => id !== docId);

        if (allIds.length === 0) return [];

        const links = await knex('documents')
            .whereIn('id', allIds)
            .select(
                'id', 'project', 'docType',
                'docNumber', 'date', 'total', 'supplier'
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
