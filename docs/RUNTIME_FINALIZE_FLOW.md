# Runtime Finalize Flow Verification

## Problem
Previously, `POST /api/extract` saved documents to `docs.json` (JsonDocsAdapter) while `POST /api/docs/finalize-bulk` looked for them in SQLite (DbDocsAdapter), resulting in "not found" errors.

## Fix
`extractController.js` now uses `require('../storage/getDocsAdapter')`, ensuring consistency with `DocService`.

## Verification Flow (Simulated)

### 1. Extract
**Request:**
`POST /api/extract`
- File: `invoice.pdf`
- Storage: `getDocsAdapter` -> Resolves to `DbDocsAdapter` (SQLite)
- Result: Row inserted into `documents` table with status 'staging'.
- Returns: `batchId: "batch-123"`

### 2. View Batch
**Request:**
`GET /api/batch/batch-123`
- Returns: `[{ id: "uuid-1", status: "staging" ... }]` from Memory/DB.

### 3. Finalize
**Request:**
`POST /api/docs/finalize-bulk`
```json
{
  "items": [
    { "id": "uuid-1", "docType": "Fatura", "docNumber": "FT 001" }
  ]
}
```

**Execution:**
1. `docController.finalizeBulk` calls `DocService.finalizeDoc`.
2. `DocService` calls `Adapter.getDoc(projectId, "uuid-1")`.
3. `Adapter` (SQLite) SELECTs * FROM documents WHERE id = 'uuid-1'.
4. **FOUND!** (Previously failed here).
5. File moved from staging -> archive.
6. Record updated to status 'processado'.

**Response:**
```json
{
  "ok": true,
  "results": [
    { "id": "uuid-1", "ok": true, "row": { "status": "processado" ... } }
  ]
}
```

*Mismatch resolved.*
