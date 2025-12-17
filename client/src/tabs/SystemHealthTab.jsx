import React, { useEffect, useState } from 'react';
import { getHealthModules } from '../api/apiClient';
import { ContractError } from '../utils/contractGuards';
import { CollapsibleCard } from '../shared/ui';

export default function SystemHealthTab() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all'); // all, closed, strict

    // Admin check logic can be inferred or passed. Assuming user Role is available in context or localStorage for "admin only details"
    // But requirement says "details only for admin".
    // For now we will hide details by default and put it inside collapsible. Admin-ness is effectively guaranteed by the Tab guard in App.jsx.

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getHealthModules();
            setData(res);
        } catch (err) {
            console.error(err);
            if (err instanceof ContractError) {
                setError({
                    message: "System health check failed (Invalid API Response).",
                    details: { endpoint: err.endpoint, keys: err.details?.keys }
                });
            } else {
                setError("Failed to load system health. Backend might be down.");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading && !data) return <div className="p-10 text-center text-slate-500">Loading modules...</div>;

    if (error) {
        return (
            <div className="p-10 text-center">
                <div className="text-red-600 font-bold mb-4">{typeof error === 'string' ? error : error.message}</div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 transition"
                >
                    Retry
                </button>

                {typeof error === 'object' && error.details && (
                    <div className="mt-8 text-left max-w-lg mx-auto border border-red-100 bg-red-50 p-4 rounded text-sm">
                        <details>
                            <summary className="cursor-pointer text-red-800 font-medium">Technical Details (Admin)</summary>
                            <pre className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">
                                {JSON.stringify(error.details, null, 2)}
                            </pre>
                        </details>
                    </div>
                )}
            </div>
        );
    }

    const modules = data?.modules || [];

    const filteredModules = modules.filter(m => {
        if (filter === 'closed') return m.closed;
        if (filter === 'strict') return m.strictRouting;
        return true;
    });

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">System Health</h2>
                    <p className="text-slate-500">Module Status & Configuration</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchData}
                        className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600 shadow-sm transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <div className="text-slate-500 text-sm font-medium">Total Modules</div>
                    <div className="text-3xl font-bold text-slate-800">{modules.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <div className="text-slate-500 text-sm font-medium">Closed Modules</div>
                    <div className="text-3xl font-bold text-green-600">{modules.filter(m => m.closed).length}</div>
                </div>
                {data?.runtime && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                        <div className="text-slate-500 text-sm font-medium">Runtime</div>
                        <div className="mt-1 text-sm text-slate-700">
                            <div><span className="font-semibold">DB:</span> {data.runtime.dbClient}</div>
                            <div><span className="font-semibold">Auth:</span> {data.runtime.authMode}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="mb-4 flex gap-2">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    All
                </button>
                <button
                    onClick={() => setFilter('closed')}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${filter === 'closed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    Closed Only
                </button>
                <button
                    onClick={() => setFilter('strict')}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${filter === 'strict' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    Strict Routing
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-3 border-b border-slate-200">Module Name</th>
                            <th className="px-6 py-3 border-b border-slate-200">Prefixes</th>
                            <th className="px-6 py-3 border-b border-slate-200 text-center">Stability</th>
                            <th className="px-6 py-3 border-b border-slate-200 text-center">Routing</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredModules.map((m) => (
                            <tr key={m.name} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 font-medium text-slate-800">{m.name}</td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {m.prefixes.map(p => (
                                            <span key={p} className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-300 font-mono">
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {m.closed ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            Closed
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            Open
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {m.strictRouting ? (
                                        <span className="text-xs font-medium text-slate-500 border border-slate-200 px-2 py-1 rounded bg-white">
                                            Strict
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-400">Lenient</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredModules.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-6 py-8 text-center text-slate-400">
                                    No modules found matching filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
