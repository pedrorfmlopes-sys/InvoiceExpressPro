
import React from 'react';
import { FiPrinter, FiX } from 'react-icons/fi';

const ProposalPrint = ({ proposal, onClose }) => {

    // Calculate Totals
    const lines = proposal.lines || [];
    const totalSiva = lines.reduce((acc, line) => acc + (line.quantity * line.unit_price_commercial), 0);
    const iva = totalSiva * 0.23; // Assuming standard rate for now
    const totalCiva = totalSiva + iva;

    const fmtMoney = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="proposal-print-container fixed inset-0 z-[9999] bg-gray-100 overflow-auto flex justify-center print:block print:relative print:inset-auto print:bg-white print:overflow-visible">

            {/* Toolbar - Hidden on Print */}
            <div className="fixed top-4 right-4 flex gap-2 print:hidden z-50">
                <button
                    onClick={handlePrint}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-medium"
                >
                    <FiPrinter /> Imprimir / Salvar PDF
                </button>
                <button
                    onClick={onClose}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-medium"
                >
                    <FiX /> Fechar
                </button>
            </div>

            {/* A4 Sheet Wrapper */}
            <div className="bg-white w-[210mm] min-h-[297mm] mx-auto my-8 shadow-2xl print:shadow-none print:m-0 print:w-full print:min-h-0 print:max-w-none box-border text-black relative">

                {/* Main Content Body - Padded to avoid footer overlap */}
                <div className="print-content-body p-[15mm]">

                    {/* Header */}
                    <header className="flex justify-between items-start mb-12 border-b pb-8">
                        <div className="w-1/2">
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">DVTKB, Lda</h1>
                            <p className="text-sm text-gray-600">www.divitek.pt</p>

                            <div className="mt-4 text-sm">
                                <p><span className="font-semibold">Morada:</span> Rua da Baixa 326, 3 Drt</p>
                                <p className="ml-[54px]">2870-231 Montijo, Portugal</p>
                                <p className="mt-1"><span className="font-semibold">Telefone:</span> 918504499</p>
                                <p className="mt-1"><span className="font-semibold">Email:</span> geral@divitek.pt</p>
                                <p className="mt-1"><span className="font-semibold">NIF:</span> PT515834807</p>
                            </div>
                        </div>

                        <div className="w-1/2 text-right">
                            <h2 className="text-3xl font-bold text-gray-800 mb-6">PROPOSTA</h2>

                            <div className="text-sm space-y-1">
                                <p><span className="font-semibold">Nº Proposta:</span> {proposal.name?.replace('Proposta:', '')}</p>
                                <p><span className="font-semibold">Cliente:</span> {proposal.client_ref}</p>
                                <p><span className="font-semibold">NIF:</span> {proposal.metadata?.client_vat || '999999999'}</p>
                                <p><span className="font-semibold">Data:</span> {new Date(proposal.updated_at).toLocaleDateString('pt-PT')}</p>
                                <p><span className="font-semibold">Validade:</span> 15 dias</p>
                            </div>
                        </div>
                    </header>

                    {/* Project Info */}
                    <div className="mb-8 p-4 bg-gray-50 rounded border border-gray-100 print:border print:border-gray-200">
                        <div className="flex gap-8 text-sm">
                            <div>
                                <span className="font-semibold">Projeto:</span> {proposal.project_ref || 'N/A'}
                            </div>
                            <div>
                                <span className="font-semibold">V/Ref.:</span> {proposal.metadata?.our_ref || 'N/A'}
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-sm mb-8 border-collapse">
                        <thead className="bg-gray-100 border-b-2 border-gray-300 text-gray-700 font-semibold uppercase tracking-wider print:bg-gray-100 print:text-black">
                            <tr>
                                <th className="py-2 px-2 text-left w-24">Código</th>
                                <th className="py-2 px-2 text-left flex-1">Descrição</th>
                                <th className="py-2 px-2 text-center w-16">Qtd</th>
                                <th className="py-2 px-2 text-center w-12">Un</th>
                                <th className="py-2 px-2 text-right w-24">P.Unit</th>
                                <th className="py-2 px-2 text-right w-24">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {lines.map((line, idx) => (
                                <tr key={idx} className="break-inside-avoid">
                                    <td className="py-2 px-2 align-top text-gray-600 font-mono text-xs pt-3">{line.sku}</td>
                                    <td className="py-2 px-2 align-top">
                                        <div className="whitespace-pre-wrap">{line.description}</div>
                                    </td>
                                    <td className="py-2 px-2 align-top text-center pt-3">{line.quantity}</td>
                                    <td className="py-2 px-2 align-top text-center text-xs text-gray-500 pt-3">UN</td>
                                    <td className="py-2 px-2 align-top text-right font-mono text-gray-700 pt-3">
                                        {fmtMoney(line.unit_price_commercial).replace('€', '')}
                                    </td>
                                    <td className="py-2 px-2 align-top text-right font-mono font-medium pt-3">
                                        {fmtMoney(line.quantity * line.unit_price_commercial).replace('€', '')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="flex justify-end break-inside-avoid page-break-inside-avoid mb-12">
                        <div className="w-64 space-y-2 text-sm border-t pt-4">
                            <div className="flex justify-between text-gray-600">
                                <span>Total (s/IVA):</span>
                                <span>{fmtMoney(totalSiva)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Embalagem:</span>
                                <span>{fmtMoney(0)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Portes:</span>
                                <span>{fmtMoney(0)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600 font-medium">
                                <span>IVA (23%):</span>
                                <span>{fmtMoney(iva)}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2 mt-2 text-gray-900">
                                <span>Total (c/IVA):</span>
                                <span>{fmtMoney(totalCiva)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed at bottom */}
                <footer className="text-xs text-gray-500 border-t pt-2 mt-auto fixed bottom-0 left-0 w-full px-[15mm] bg-white print:px-[15mm]">
                    {/* Padding matches content body padding for alignment */}
                    <div className="mb-2 font-semibold text-gray-700">Pagamento por transferência bancária:</div>
                    <div className="flex justify-between items-end">
                        <div>
                            BPI: PT50 0010 0000 5819 1020 0010 2
                        </div>
                        <div>
                            Este documento não serve de fatura
                        </div>
                    </div>
                </footer>

            </div>
        </div>
    );
};

export default ProposalPrint;
