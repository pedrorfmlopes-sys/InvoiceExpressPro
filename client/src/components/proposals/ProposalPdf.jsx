import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// Register a standard font if needed, but Helvetica is default and safe.

// Register a standard font if needed, but Helvetica is default and safe.
// Font.register({ family: 'Roboto', src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf' });

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 40, // ~15mm
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: '#333333'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingBottom: 10
    },
    companyInfo: {
        width: '45%'
    },
    companyTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4
    },
    companySub: {
        fontSize: 8,
        color: '#666666',
        marginTop: 2
    },
    docInfo: {
        width: '55%',
        alignItems: 'flex-end'
    },
    docTitle: {
        fontSize: 22,
        fontWeight: 'extrabold',
        color: '#111827',
        marginBottom: 12,
        textAlign: 'right',
        width: '100%',
        letterSpacing: 1
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: '#E5E7EB',
        paddingBottom: 4
    },
    headerSubTitle: {
        fontSize: 6.5,
        color: '#6B7280',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: 2,
        textAlign: 'left'
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 1
    },
    label: {
        fontWeight: 'bold',
        fontSize: 8,
        color: '#374151',
        textAlign: 'left'
    },
    value: {
        fontSize: 9,
        marginLeft: 4,
        color: '#111827',
        textAlign: 'left'
    },
    clientBlock: {
        marginTop: 5,
        alignItems: 'flex-start',
        width: 250, // Fixed width to ensure left-justification starts at a consistent spot on the right
        padding: 5
    },
    clientName: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 4,
        textAlign: 'left'
    },
    clientAddress: {
        fontSize: 8,
        color: '#4B5563',
        textAlign: 'left',
        maxWidth: '100%',
        lineHeight: 1.3
    },
    grayBox: {
        backgroundColor: '#F9FAFB',
        padding: 6,
        borderRadius: 2,
        marginBottom: 8,
        width: '85%'
    },
    projectBox: {
        // Redefined as the main container for the middle section
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
        width: '100%'
    },
    table: {
        width: '100%',
        borderStyle: 'solid',
        borderColor: '#E5E7EB',
        borderWidth: 0,
        borderBottomWidth: 1
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        borderStyle: 'solid',
        alignItems: 'flex-start',
        minHeight: 20,
        fontSize: 8,
        paddingVertical: 3
    },
    tableHeader: {
        backgroundColor: '#F3F4F6',
        color: '#111827',
        fontWeight: 'bold',
        fontSize: 7,
        textTransform: 'uppercase',
        padding: 4
    },
    colCode: { width: '12%', padding: 2 },
    colDesc: { width: '43%', padding: 2 },
    colQty: { width: '8%', padding: 2, textAlign: 'center' },
    colUn: { width: '5%', padding: 2, textAlign: 'center' },
    colPrice: { width: '12%', padding: 2, textAlign: 'right' },
    colDisc: { width: '8%', padding: 2, textAlign: 'center' },
    colTotal: { width: '12%', padding: 2, textAlign: 'right' },

    skuText: { fontFamily: 'Helvetica', color: '#4B5563' },
    descText: { fontFamily: 'Helvetica' },

    totalsSection: {
        marginTop: 10,
        marginLeft: 'auto',
        width: '55%',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingTop: 10
    },
    totalRow: {
        flexDirection: 'row',
        paddingVertical: 4,
        fontSize: 9
    },
    totalLabel: {
        width: '60%',
        textAlign: 'right',
        paddingRight: 8,
        color: '#4B5563'
    },
    totalValue: {
        width: '40%',
        textAlign: 'right',
        fontFamily: 'Helvetica-Bold',
        color: '#111827'
    },
    finalTotal: {
        borderTopWidth: 1,
        borderTopColor: '#111827',
        paddingTop: 8,
        marginTop: 8,
        flexDirection: 'row'
    },
    finalTotalLabel: {
        width: '60%',
        textAlign: 'right',
        paddingRight: 8,
        fontSize: 11,
        fontWeight: 'bold'
    },
    finalTotalValue: {
        width: '40%',
        textAlign: 'right',
        fontSize: 11,
        fontWeight: 'bold'
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        borderTopWidth: 1,
        borderTopColor: '#EEEEEE',
        paddingTop: 10,
        fontSize: 7,
        color: '#9CA3AF',
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    pageNumber: {
        position: 'absolute',
        fontSize: 8,
        bottom: 30,
        left: 0,
        right: 40,
        textAlign: 'right',
        color: '#9CA3AF'
    }
});

const ProposalPdf = ({ proposal, visibleCollections }) => {
    if (!proposal) return <Document></Document>;

    const shouldShow = (name) => {
        if (!name) return false;
        if (!visibleCollections) return true; // Default to show if no config passed
        return visibleCollections.has(String(name).trim().toLowerCase());
    };

    const lines = proposal.lines || [];

    // Calculations
    const totalSiva = lines.reduce((acc, line) => {
        const qty = parseFloat(line.quantity || 0);
        const price = parseFloat(line.unit_price_commercial || 0);
        const disc = parseFloat(line.discount_commercial_percent || 0);
        return acc + (qty * price * (1 - disc / 100));
    }, 0);

    const shipping = parseFloat(proposal.metadata?.shipping_cost || 0);
    const globalDiscPercent = parseFloat(proposal.metadata?.global_discount || 0);

    // Calculate Discount Value based on (Sum + Shipping)
    // Common practice: Discount applies to merchandise, but sometimes shipping too.
    // Let's apply to (TotalSiva + Shipping) to be generous, or just TotalSiva?
    // Usually "Global Discount" on a proposal applies to the subtotal.
    // Let's do: (TotalSiva + Shipping) * (Percent / 100)
    const discountValue = (totalSiva + shipping) * (globalDiscPercent / 100);

    const taxBase = totalSiva + shipping - discountValue;
    const iva = taxBase * 0.23;
    const totalCiva = taxBase + iva;

    // Default text for signature
    const signText = "Para confirmação da encomenda, o documento deve ser devolvido assinado e carimbado, aceitando os termos e condições apresentados.";

    // Explicit Warranty Text from Metadata
    const warrantyText = proposal.metadata?.warranty_text || "";

    // User observations
    const userObs = proposal.metadata?.observations || "";
    // Payment Conditions
    const payCond = proposal.metadata?.payment_conditions || "Pronto Pagamento";

    const fmtMoney = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

    return (
        <Document>
            <Page size="A4" style={styles.page} wrap>

                {/* Header */}
                <View style={styles.header} fixed>
                    {/* Left Column: Company & Boxes */}
                    <View style={{ width: '45%' }}>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyTitle}>DVTKB, Lda</Text>
                            <Text style={styles.companySub}>www.divitek.pt</Text>
                            <Text style={styles.companySub}>Rua da Baixa 326, 3 Drt</Text>
                            <Text style={styles.companySub}>2870-231 Montijo, Portugal</Text>
                            <Text style={styles.companySub}>NIF: PT515834807</Text>
                        </View>

                        <View style={{ marginTop: 15 }}>
                            {/* References Box */}
                            <View style={styles.grayBox}>
                                <View style={styles.infoRow}>
                                    <Text style={[styles.label, { width: 60 }]}>Vossa Ref.:</Text>
                                    <Text style={styles.value}>{proposal.metadata?.client_project_name || '---'}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={[styles.label, { width: 60 }]}>Nossa Ref.:</Text>
                                    <Text style={styles.value}>{proposal.metadata?.our_ref || '---'}</Text>
                                </View>
                            </View>

                            {/* Delivery Address Box */}
                            <View style={styles.grayBox}>
                                <Text style={styles.headerSubTitle}>Morada de Entrega</Text>
                                <Text style={[styles.clientAddress, { maxWidth: '100%' }]}>
                                    {proposal.metadata?.shipping_is_billing
                                        ? 'Mesma que faturação'
                                        : (proposal.metadata?.shipping_address || '---')
                                    }
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Right Column: Title & Client */}
                    <View style={styles.docInfo}>
                        <Text style={styles.docTitle}>PROPOSTA</Text>

                        {/* Aligned container for Number/Date and Client Info */}
                        <View style={{ width: 250, alignItems: 'flex-start' }}>
                            {/* Nº Proposta & Data on the same line */}
                            <View style={styles.headerRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.label}>Nº Proposta:</Text>
                                    <Text style={styles.value}>{proposal.metadata?.doc_number || proposal.name?.replace('Proposta:', '').trim()}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.label}>Data:</Text>
                                    <Text style={styles.value}>{new Date(proposal.updated_at).toLocaleDateString('pt-PT')}</Text>
                                </View>
                            </View>

                            {/* Client Info Block (The Green Rectangle Area) */}
                            <View style={styles.clientBlock}>
                                <Text style={styles.headerSubTitle}>Cliente</Text>
                                <Text style={styles.clientName}>{proposal.client_ref}</Text>

                                <Text style={[styles.headerSubTitle, { marginTop: 6 }]}>Morada de Faturação</Text>
                                <Text style={styles.clientAddress}>{proposal.metadata?.billing_address || proposal.client_ref}</Text>

                                <View style={[styles.infoRow, { marginTop: 6 }]}>
                                    <Text style={[styles.label, { fontWeight: 'bold' }]}>NIF:</Text>
                                    <Text style={[styles.value, { fontWeight: 'bold' }]}>{proposal.metadata?.client_vat || '---'}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Table Header - Fixed on new pages */}
                <View style={[styles.tableRow, styles.tableHeader]} fixed>
                    <Text style={styles.colCode}>CÓDIGO</Text>
                    <Text style={styles.colDesc}>DESCRIÇÃO</Text>
                    <Text style={styles.colQty}>QTD</Text>
                    <Text style={styles.colUn}>UN</Text>
                    <Text style={styles.colPrice}>P.UNIT</Text>
                    <Text style={styles.colDisc}>DESC(%)</Text>
                    <Text style={styles.colTotal}>TOTAL</Text>
                </View>

                {/* Table Rows (Auto Pagination!) */}
                {lines.map((line, idx) => {
                    const qty = parseFloat(line.quantity || 0);
                    const price = parseFloat(line.unit_price_commercial || 0);
                    const disc = parseFloat(line.discount_commercial_percent || 0);
                    const total = qty * price * (1 - disc / 100);

                    return (
                        <View key={idx} style={styles.tableRow} wrap={false}>
                            <Text style={[styles.colCode, styles.skuText]}>{line.sku}</Text>
                            <View style={[styles.colDesc]}>
                                <Text style={styles.descText}>{line.description}</Text>
                                {proposal.metadata?.show_technical_details && (
                                    <>
                                        {line.extra_attributes?.original_description && (
                                            <Text style={{ fontSize: 6, color: '#6B7280', marginTop: 1, fontFamily: 'Helvetica-Oblique' }}>
                                                ({line.extra_attributes.original_description})
                                            </Text>
                                        )}
                                        {shouldShow(line.extra_attributes?.collection) && (
                                            <Text style={{ fontSize: 6, color: '#6B7280', marginTop: 1, textTransform: 'uppercase', fontWeight: 'bold' }}>
                                                Coleção {line.extra_attributes.collection}
                                            </Text>
                                        )}
                                    </>
                                )}
                            </View>
                            <Text style={styles.colQty}>{line.quantity}</Text>
                            <Text style={styles.colUn}>UN</Text>
                            <Text style={styles.colPrice}>{fmtMoney(price).replace('€', '')}</Text>
                            <Text style={styles.colDisc}>{disc > 0 ? `${disc}%` : ''}</Text>
                            <Text style={styles.colTotal}>{fmtMoney(total).replace('€', '')}</Text>
                        </View>
                    );
                })}

                {/* Bottom Section: Notes/Conditions (Left) and Totals (Right) */}
                <View style={{ flexDirection: 'row', marginTop: 20, marginBottom: 20 }} wrap={false}>

                    {/* LEFT: Observations & Payment Conditions */}
                    <View style={{ width: '45%', paddingRight: 10 }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 4, color: '#4B5563', textTransform: 'uppercase' }}>Condições de Pagamento / Notas:</Text>
                        <Text style={{ fontSize: 8, color: '#4B5563', marginBottom: 8 }}>{payCond}</Text>

                        {userObs ? (
                            <View>
                                <Text style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 4, color: '#4B5563', textTransform: 'uppercase' }}>Observações:</Text>
                                <Text style={{ fontSize: 8, color: '#4B5563' }}>{userObs}</Text>
                            </View>
                        ) : null}
                    </View>

                    {/* RIGHT: Totals */}
                    <View style={{ width: '55%' }}>
                        <View style={styles.totalsSection}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Soma Ilíquida:</Text>
                                <Text style={styles.totalValue}>{fmtMoney(totalSiva)}</Text>
                            </View>

                            {shipping > 0 && (
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>Portes/Envio:</Text>
                                    <Text style={styles.totalValue}>{fmtMoney(shipping)}</Text>
                                </View>
                            )}

                            {discountValue > 0 && (
                                <View style={styles.totalRow}>
                                    <Text style={[styles.totalLabel, { color: '#EF4444' }]}>Desconto Extra ({globalDiscPercent}%):</Text>
                                    <Text style={[styles.totalValue, { color: '#EF4444' }]}>- {fmtMoney(discountValue)}</Text>
                                </View>
                            )}

                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>IVA (23%):</Text>
                                <Text style={styles.totalValue}>{fmtMoney(iva)}</Text>
                            </View>
                            <View style={styles.finalTotal}>
                                <Text style={styles.finalTotalLabel}>Total:</Text>
                                <Text style={styles.finalTotalValue}>{fmtMoney(totalCiva)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Signature Section */}
                <View style={{ marginTop: 20, marginBottom: 40 }} wrap={false}>
                    <View style={{ borderTopWidth: 1, borderTopColor: '#DDD', paddingTop: 4 }}>
                        <Text style={{ fontSize: 8, color: '#4B5563' }}>{signText}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 }}>
                        <View style={{ borderTopWidth: 1, borderTopColor: 'black', width: '40%', paddingTop: 4 }}>
                            <Text style={{ fontSize: 8 }}>Com o acordo, data: _____/_____/_________</Text>
                        </View>
                    </View>

                    {/* Warranty Text (Conditional) */}
                    {warrantyText ? (
                        <View style={{ marginTop: 20 }}>
                            <Text style={{ fontSize: 6, color: '#6B7280', textAlign: 'justify', lineHeight: 1.2 }}>
                                {warrantyText}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {/* Technical Finishes Annex */}
                {(() => {
                    const uniqueFinishes = [];
                    const finishCheck = new Set();
                    lines.forEach(line => {
                        const note = line.extra_attributes?.finish_note;
                        if (note && !finishCheck.has(note)) {
                            finishCheck.add(note);
                            uniqueFinishes.push({
                                code: line.extra_attributes?.finish_code || '',
                                note: note
                            });
                        }
                    });

                    if (uniqueFinishes.length === 0) return null;

                    return (
                        <View style={{ marginTop: 10, break: 'before' }}>
                            <View style={{ backgroundColor: '#F3F4F6', padding: 8, marginBottom: 10 }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    Especificações Técnicas de Acabamentos
                                </Text>
                            </View>
                            {uniqueFinishes.map((f, i) => (
                                <View key={i} style={{ marginBottom: 10 }}>
                                    {f.code ? (
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 2 }}>{f.code}</Text>
                                    ) : null}
                                    <Text style={{ fontSize: 8, color: '#4B5563', textAlign: 'justify' }}>{f.note}</Text>
                                </View>
                            ))}
                        </View>
                    );
                })()}

                {/* Fixed Footer */}
                <View style={styles.footer} fixed>
                    <View style={{ flexDirection: 'column', gap: 2 }}>
                        <Text>Pagamento por transferência bancária (BPI): PT50 0010 0000 5819 1020 0010 2</Text>
                        <Text style={{ fontSize: 6, color: '#999', marginTop: 2 }}>Este documento não serve de fatura</Text>
                    </View>
                    <Text
                        style={{ fontSize: 8, color: '#9CA3AF' }}
                        render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`}
                    />
                </View>

            </Page>
        </Document >
    );
};

export default ProposalPdf;
