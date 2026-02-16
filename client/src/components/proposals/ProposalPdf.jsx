import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

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
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#EEEEEE',
        paddingBottom: 10
    },
    companyInfo: {
        width: '50%'
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
        width: '40%',
        textAlign: 'right'
    },
    docTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 2
    },
    label: {
        fontWeight: 'bold',
        width: 70,
        textAlign: 'right',
        marginRight: 5
    },
    value: {
        textAlign: 'left'
    },
    projectBox: {
        backgroundColor: '#F9FAFB',
        padding: 8,
        borderRadius: 4,
        marginBottom: 20,
        flexDirection: 'row',
        gap: 20
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
        minHeight: 20, // Reduced height
        fontSize: 8,   // Reduced font size
        paddingVertical: 2
    },
    tableHeader: {
        backgroundColor: '#F3F4F6',
        color: '#111827',
        fontWeight: 'bold',
        fontSize: 7, // Smaller header too
        textTransform: 'uppercase',
        padding: 4
    },
    colCode: { width: '12%', padding: 2 },
    colDesc: { width: '43%', padding: 2 },
    colQty: { width: '8%', padding: 2, textAlign: 'center' },
    colUn: { width: '5%', padding: 2, textAlign: 'center' },
    colPrice: { width: '12%', padding: 2, textAlign: 'right' },
    colDisc: { width: '8%', padding: 2, textAlign: 'center' }, // New Column
    colTotal: { width: '12%', padding: 2, textAlign: 'right' },

    skuText: { fontFamily: 'Helvetica', color: '#4B5563' },
    descText: { fontFamily: 'Helvetica' },

    totalsSection: {
        marginTop: 10,
        marginLeft: 'auto',
        width: '55%', // Increased again to be safe
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingTop: 10
    },
    totalRow: {
        flexDirection: 'row',
        paddingVertical: 4,
        fontSize: 9
    },
    // New specific styles for columns to prevent overlap
    totalLabel: {
        width: '60%',
        textAlign: 'right',
        paddingRight: 8,
        color: '#4B5563'
    },
    totalValue: {
        width: '40%',
        textAlign: 'right',
        fontFamily: 'Helvetica-Bold', // Make numbers pop slightly
        color: '#111827'
    },
    finalTotal: {
        borderTopWidth: 1,
        borderTopColor: '#000000',
        paddingTop: 8,
        marginTop: 8,
        flexDirection: 'row' // Ensure it uses the same row layout
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
    }
});

const ProposalPdf = ({ proposal }) => {
    if (!proposal) return <Document></Document>;

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
                    <View style={styles.companyInfo}>
                        <Text style={styles.companyTitle}>DVTKB, Lda</Text>
                        <Text style={styles.companySub}>www.divitek.pt</Text>
                        <Text style={styles.companySub}>Rua da Baixa 326, 3 Drt</Text>
                        <Text style={styles.companySub}>2870-231 Montijo, Portugal</Text>
                        <Text style={styles.companySub}>NIF: PT515834807</Text>
                    </View>
                    <View style={styles.docInfo}>
                        <Text style={styles.docTitle}>PROPOSTA</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Nº Proposta:</Text>
                            <Text style={styles.value}>{proposal.name?.replace('Proposta:', '')}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Cliente:</Text>
                            <Text style={styles.value}>{proposal.client_ref}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>NIF:</Text>
                            <Text style={styles.value}>{proposal.metadata?.client_vat || '999999999'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Data:</Text>
                            <Text style={styles.value}>{new Date(proposal.updated_at).toLocaleDateString('pt-PT')}</Text>
                        </View>
                        <View style={{ marginTop: 10, textAlign: 'right' }}>
                            <Text style={{ fontSize: 7, color: '#666666', textTransform: 'uppercase', fontWeight: 'bold' }}>Morada Faturação:</Text>
                            <Text style={{ fontSize: 8 }}>{proposal.metadata?.billing_address || proposal.client_ref}</Text>
                        </View>
                    </View>
                </View>

                {/* Project & Shipping Box */}
                <View style={styles.projectBox} fixed>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 20 }}>
                        <View style={{ flexDirection: 'row' }}>
                            <Text style={{ fontWeight: 'bold', marginRight: 5 }}>Ref. Proj.:</Text>
                            <Text>{proposal.metadata?.our_ref || 'N/A'}</Text>
                        </View>
                        {proposal.metadata?.client_project_name && (
                            <View style={{ flexDirection: 'row' }}>
                                <Text style={{ fontWeight: 'bold', marginRight: 5 }}>Projeto:</Text>
                                <Text>{proposal.metadata.client_project_name}</Text>
                            </View>
                        )}
                    </View>
                    <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#E5E7EB', paddingLeft: 10 }}>
                        <Text style={{ fontSize: 7, color: '#666666', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 2 }}>Morada de Entrega:</Text>
                        <Text style={{ fontSize: 8 }}>
                            {proposal.metadata?.shipping_is_billing
                                ? 'Mesma que faturação'
                                : (proposal.metadata?.shipping_address || 'N/A')
                            }
                        </Text>
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
                            <Text style={[styles.colDesc, styles.descText]}>{line.description}</Text>
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

                {/* Fixed Footer */}
                <View style={styles.footer} fixed>
                    <View style={{ flexDirection: 'column', gap: 2 }}>
                        <Text>Pagamento por transferência bancária (BPI): PT50 0010 0000 5819 1020 0010 2</Text>
                    </View>
                    <Text>Este documento não serve de fatura</Text>
                </View>

            </Page>
        </Document>
    );
};

export default ProposalPdf;
