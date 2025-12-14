# Export V2 Fields Documentation

The endpoint `POST /api/v2/export.xlsx` generates a comprehensive Excel report including canonical V2.2 fields.

## Columns

| Header | Field | Description |
| :--- | :--- | :--- |
| **ID** | `id` | Unique UUID |
| **Estado** | `status` | `uploaded`, `extracted`, `reviewed`, `processed` |
| **Tipo (Canonical)** | `docTypeLabel` | Portuguese Normalized Label (e.g. "Fatura") |
| **Tipo (Raw)** | `docTypeRaw` | Original text found (e.g. "Fattura") |
| **Tipo ID** | `docTypeId` | Canonical Slug (e.g. "fatura") |
| **Nº Documento** | `docNumber` | Extracted Document Number |
| **Data** | `date` | Emissio Date (YYYY-MM-DD) |
| **Vencimento** | `dueDate` | Due Date |
| **Fornecedor** | `supplier` | Supplier Name |
| **Cliente** | `customer` | Customer Name (Bill To) |
| **Total** | `total` | Total Amount (Float) |
| **Moeda** | `currency` | Currency Code (EUR) |
| **Referências** | `references_json` | JSON Array of references (PO, Ref) |
| **Notas** | `notes` | Manual notes |
| **Método Extração** | `extractionMethod` | `ai`, `regex` |
| **Confiança** | `confidence` | 0.0 - 1.0 Score |
| **Rev. Tipologia** | `needsReviewDocType` | Sim/Não (Needs Review if Type Unknown) |
| **Ficheiro** | `origName` | Original Filename |
| **Criado Em** | `created_at` | timestamp |
| **Atualizado Em** | `updated_at` | timestamp |

## Logic
- **Canonicalization**: The system attempts to map `docTypeRaw` to a known Portuguese Type. If successful, `Tipo (Canonical)` is populated. If not, it falls back to Raw.
- **Bulk Updates**: Edits via the Bulk Action bar update `docTypeId`, `docTypeLabel`, and legacy `docType` simultaneously.
