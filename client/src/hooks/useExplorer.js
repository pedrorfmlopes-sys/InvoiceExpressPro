import { useState, useCallback, useEffect } from 'react';
import api from '../api/apiClient';

export function useExplorer(project) {
    const [docs, setDocs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        archived: 'false',
        q: '',
        project: project || 'ALL', // Default to ALL if project not passed?? Or context?
        scope: '',
        sub_project_id: '',
        category_id: ''
    });

    // Aux Data
    const [subProjects, setSubProjects] = useState([]);
    const [categories, setCategories] = useState([]);

    // Refs for debouncing if needed, but simple useEffect is fine for now

    const fetchDocs = useCallback(async (overrideFilters = {}) => {
        setLoading(true);
        try {
            // Merge current filters with overrides
            const f = { ...filters, ...overrideFilters };
            // Ensure project is consistent
            const p = f.project === 'GLOBAL' ? 'ALL' : (f.project || project || 'ALL');

            const params = new URLSearchParams();
            params.append('project', p);
            if (f.q) params.append('q', f.q);
            if (f.archived) params.append('archived', f.archived);
            if (f.scope) params.append('scope', f.scope);
            if (f.sub_project_id) params.append('sub_project_id', f.sub_project_id);
            if (f.category_id) params.append('category_id', f.category_id);

            if (f.docType) params.append('docType', f.docType);
            if (f.hasLinks) params.append('hasLinks', f.hasLinks);
            if (f.supplier) params.append('supplier', f.supplier);
            if (f.dateStart) params.append('dateStart', f.dateStart);
            if (f.dateEnd) params.append('dateEnd', f.dateEnd);
            if (f.sort) params.append('sort', f.sort);
            if (f.sortDir) params.append('sortDir', f.sortDir);

            // Limit? Cursor?
            params.append('limit', 100);

            const res = await api.get(`/api/explorer/docs?${params.toString()}`);
            setDocs(res.data.rows || []);
            // setTotal(res.data.total ?? 0);
        } catch (e) {
            console.error("Fetch docs failed", e);
        } finally {
            setLoading(false);
        }
    }, [filters, project]);

    const updateDoc = async (id, updates) => {
        // Optimistic UI updates could happen in the component
        try {
            const p = filters.project === 'GLOBAL' ? 'ALL' : (filters.project || project);
            const res = await api.patch(`/api/explorer/doc/${id}?project=${p}`, updates);
            // Update local state
            setDocs(prev => prev.map(d => d.id === id ? { ...d, ...res.data } : d));
            return res.data;
        } catch (e) {
            console.error("Update failed", e);
            throw e;
        }
    };

    const loadAux = useCallback(async () => {
        try {
            const p = filters.project === 'GLOBAL' ? 'ALL' : (filters.project || project || 'ALL');
            const [spRes, catRes] = await Promise.all([
                api.get(`/api/explorer/subprojects?project=${p}`),
                api.get(`/api/explorer/categories?project=${p}`)
            ]);
            setSubProjects(spRes.data || []);
            setCategories(catRes.data || []);
        } catch (e) {
            console.error("Load aux failed", e);
        }
    }, [filters.project, project]);

    useEffect(() => {
        fetchDocs();
        loadAux();
    }, []); // Initial load only? Or depend on filters? 
    // Ideally we trigger fetchDocs when filters change.

    useEffect(() => {
        fetchDocs();
    }, [filters]);

    return {
        docs,
        loading,
        filters,
        setFilters,
        updateDoc,
        subProjects,
        categories,
        reload: fetchDocs,
        loadAux
    };
}
