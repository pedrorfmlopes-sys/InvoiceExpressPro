import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { IconDeviceFloppy, IconPlus, IconTrash, IconEye, IconTarget } from '@tabler/icons-react';
import api from '../../api/apiClient';

// Worker setup
// Worker setup: Match the API version (4.8.69)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

export default function ProfileEditor({ profileId, onClose, initialFile = null }) {
    const [profile, setProfile] = useState(null);
    const [fields, setFields] = useState([]);
    const [signatures, setSignatures] = useState([]);
    const [testFile, setTestFile] = useState(initialFile);
    const [numPages, setNumPages] = useState(null);
    const [pageScale, setPageScale] = useState(1.0);

    // Selection State
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentRect, setCurrentRect] = useState(null); // {x, y, w, h} in %
    const [selectedField, setSelectedField] = useState(null); // Key of field being edited

    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const res = await api.get(`/api/extraction/profiles/${profileId}`);
            setProfile(res.data);
            setFields(res.data.fields || []);
            setSignatures(res.data.signatures || []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleMouseDown = (e) => {
        if (!selectedField) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setIsDrawing(true);
        setStartPos({ x, y });
        setCurrentRect({ x, y, w: 0, h: 0 });
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        setCurrentRect({
            x: Math.min(startPos.x, x),
            y: Math.min(startPos.y, y),
            w: Math.abs(x - startPos.x),
            h: Math.abs(y - startPos.y)
        });
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
        if (selectedField && currentRect) {
            // Update the field with new rect
            const updatedFields = fields.map(f => {
                if (f.field_key === selectedField) {
                    return { ...f, rect: currentRect, method: 'region', page: 1 };
                }
                return f;
            });
            setFields(updatedFields);
            setCurrentRect(null);
            setSelectedField(null);
        }
    };

    const handleSave = async () => {
        try {
            await api.put(`/api/extraction/profiles/${profileId}`, {
                fields,
                signatures
            });
            onClose();
        } catch (err) {
            alert('Error saving');
        }
    };

    const handleTestExtraction = async () => {
        if (!testFile) return alert("Upload a PDF to test");
        const formData = new FormData();
        formData.append('file', testFile);
        formData.append('profileId', profileId);

        try {
            const res = await api.post('/api/extraction/extract', formData);
            alert(JSON.stringify(res.data, null, 2));
        } catch (err) {
            alert('Extraction Failed');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] w-full h-full max-w-7xl rounded-lg flex flex-col overflow-hidden">
                {/* Header */}
                <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-[#252525]">
                    <h2 className="font-bold text-white">Editar Perfil: {profile?.name}</h2>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-3 py-1 text-gray-400 hover:text-white">Cancelar</button>
                        <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 gap-2 flex items-center">
                            <IconDeviceFloppy size={16} /> Guardar
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: PDF Viewer */}
                    <div className="flex-1 bg-[#333] relative flex justify-center overflow-auto p-4">
                        {!testFile ? (
                            <div className="flex flex-col items-center justify-center text-gray-400">
                                <p className="mb-4">Carregue um PDF de exemplo para definir zonas</p>
                                <input type="file" accept="application/pdf" onChange={e => setTestFile(e.target.files[0])} />
                            </div>
                        ) : (
                            <div
                                ref={containerRef}
                                className="relative shadow-lg border border-white/10 transition-colors"
                                style={{
                                    width: 'fit-content',
                                    cursor: selectedField ? 'crosshair' : 'default',
                                    outline: selectedField ? '2px solid rgba(59, 130, 246, 0.5)' : 'none'
                                }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                            >
                                <Document file={testFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                                    <Page pageNumber={1} width={600} renderTextLayer={false} renderAnnotationLayer={false} />
                                </Document>

                                {/* Helper Overlay if no field selected */}
                                {!selectedField && !isDrawing && (
                                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/80 text-white px-3 py-1 rounded text-xs shadow-lg">
                                            Selecione um campo à direita para desenhar
                                        </div>
                                    </div>
                                )}

                                {/* Overlay for drawing */}
                                {isDrawing && currentRect && (
                                    <div
                                        className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                                        style={{
                                            left: `${currentRect.x * 100}%`,
                                            top: `${currentRect.y * 100}%`,
                                            width: `${currentRect.w * 100}%`,
                                            height: `${currentRect.h * 100}%`
                                        }}
                                    />
                                )}

                                {/* Existing Zones */}
                                {fields.map(field => field.rect && (
                                    <div
                                        key={field.field_key}
                                        className={`absolute border flex items-center justify-center text-[10px] text-white font-bold
                                   ${selectedField === field.field_key ? 'border-yellow-400 bg-yellow-400/20' : 'border-green-500 bg-green-500/10'}
                               `}
                                        onClick={(e) => { e.stopPropagation(); setSelectedField(field.field_key); }}
                                        style={{
                                            left: `${field.rect.x * 100}%`,
                                            top: `${field.rect.y * 100}%`,
                                            width: `${field.rect.w * 100}%`,
                                            height: `${field.rect.h * 100}%`
                                        }}
                                    >
                                        {field.field_key}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Sidebar */}
                    <div className="w-80 bg-[#1e1e1e] border-l border-white/10 flex flex-col">
                        <div className="p-4 border-b border-white/10">
                            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Campos</h3>

                            {/* Selected Field Editor with Friendly Names */}
                            {selectedField && (
                                <div className="mb-4 p-3 bg-blue-900/10 border border-blue-500/30 rounded">
                                    <label className="text-[10px] uppercase text-blue-300 font-bold mb-1 block">Tipo de Campo</label>

                                    <select
                                        className="w-full bg-[#111] border border-white/20 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none mb-2"
                                        value={
                                            ['invoice_no', 'date', 'total_amount', 'net_amount', 'tax_amount', 'vat_id', 'supplier', 'currency', 'due_date'].includes(selectedField)
                                                ? selectedField
                                                : '__custom__'
                                        }
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val !== '__custom__') {
                                                // Update to standard key
                                                const newKey = val;
                                                setFields(fields.map(f => f.field_key === selectedField ? { ...f, field_key: newKey } : f));
                                                setSelectedField(newKey);
                                            } else {
                                                // Prepare for custom input (don't change key yet, just UI state logic effectively handled by value check)
                                                // Actually forcing it to a placeholder first avoids losing focus on render
                                                const newKey = 'custom_' + Date.now().toString().slice(-4);
                                                setFields(fields.map(f => f.field_key === selectedField ? { ...f, field_key: newKey } : f));
                                                setSelectedField(newKey);
                                            }
                                        }}
                                    >
                                        <option value="invoice_no">Número da Fatura</option>
                                        <option value="date">Data da Fatura</option>
                                        <option value="total_amount">Valor Total</option>
                                        <option value="net_amount">Valor Líquido</option>
                                        <option value="tax_amount">Valor do IVA</option>
                                        <option value="vat_id">NIF Fornecedor</option>
                                        <option value="supplier">Nome do Fornecedor</option>
                                        <option value="due_date">Data de Vencimento</option>
                                        <option value="currency">Moeda</option>
                                        <option value="__custom__">Outro (Personalizado)</option>
                                    </select>

                                    {/* Show custom input only if not a standard field */}
                                    {!['invoice_no', 'date', 'total_amount', 'net_amount', 'tax_amount', 'vat_id', 'supplier', 'currency', 'due_date'].includes(selectedField) && (
                                        <div>
                                            <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Nome Técnico Personalizado</label>
                                            <input
                                                className="w-full bg-[#111] border border-white/20 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                                                value={selectedField}
                                                onChange={(e) => {
                                                    const newKey = e.target.value;
                                                    setFields(fields.map(f => f.field_key === selectedField ? { ...f, field_key: newKey } : f));
                                                    setSelectedField(newKey);
                                                }}
                                                placeholder="ex: numero_pedido"
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                {fields.map(field => (
                                    <div
                                        key={field.field_key}
                                        className={`p-2 rounded border cursor-pointer flex items-center justify-between
                                   ${selectedField === field.field_key ? 'bg-blue-900/30 border-blue-500' : 'bg-[#252525] border-white/5 hover:border-white/20'}
                               `}
                                        onClick={() => setSelectedField(field.field_key)}
                                    >
                                        <div>
                                            <div className="text-sm font-medium text-white">{field.field_key}</div>
                                            <div className="text-xs text-gray-500">{field.method} {field.rect ? '✅' : '⚠️'}</div>
                                        </div>
                                        <IconTarget size={16} className={selectedField === field.field_key ? 'text-blue-400' : 'text-gray-600'} />
                                    </div>
                                ))}
                                <button
                                    onClick={() => {
                                        const newField = { field_key: 'field_' + (fields.length + 1), method: 'region' };
                                        setFields([...fields, newField]);
                                        setSelectedField(newField.field_key); // Auto-select
                                    }}
                                    className="w-full py-2 text-xs text-blue-400 border border-dashed border-blue-900/50 hover:bg-blue-900/20 rounded flex items-center justify-center gap-1"
                                >
                                    <IconPlus size={12} /> Adicionar Campo
                                </button>
                            </div>
                        </div>

                        <div className="p-4 border-b border-white/10">
                            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Assinaturas (Keywords)</h3>
                            {signatures.map((sig, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                    <input
                                        className="flex-1 bg-[#111] border border-white/10 rounded px-2 text-xs text-white"
                                        value={sig.keyword}
                                        onChange={(e) => {
                                            const newSigs = [...signatures];
                                            newSigs[idx].keyword = e.target.value;
                                            setSignatures(newSigs);
                                        }}
                                    />
                                    <button onClick={() => setSignatures(signatures.filter((_, i) => i !== idx))}><IconTrash size={14} className="text-red-500" /></button>
                                </div>
                            ))}
                            <button onClick={() => setSignatures([...signatures, { keyword: '', weight: 10 }])} className="text-xs text-blue-400">+ Adicionar Keyword</button>
                        </div>

                        <div className="p-4 mt-auto">
                            <button
                                onClick={handleTestExtraction}
                                disabled={!testFile}
                                className="w-full py-2 bg-[#333] hover:bg-[#444] text-white text-xs rounded border border-white/10 flex items-center justify-center gap-2"
                            >
                                <IconEye size={14} /> Testar Extração
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
