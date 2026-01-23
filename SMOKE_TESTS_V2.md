# SMOKE TESTS - Extraction Engine V2

This document details how to verify the new Extraction Engine V2 (`/api/v2/extract`).

## Prerequisites
- Server running (`npm run dev` or `node server/src/index.js`)
- Valid JWT Token (if auth enabled) - The provided script handles basic auth bypass if running in dev mode or assumes `x-user-id` context injection.

## Test Script
A helper script has been created at `scripts/smoke_v2.js`.

### Usage
```bash
# Run with a specific PDF
node scripts/smoke_v2.js --file path/to/invoice.pdf

# Run with custom host
node scripts/smoke_v2.js --file path/to/doc.pdf --host http://localhost:3000
```

## Manual Verification (Curl)

### 1. Proforma Invoice
**Goal**: Verify `docType` is `proforma` and totals are extracted.

```bash
curl -X POST http://localhost:3000/api/v2/extract \
  -H "x-user-id: 123" \
  -F "files=@./samples/proforma_example.pdf"
```

**Expected JSON Response**:
```json
{
  "results": [
    {
      "status": "success",
      "normalized": {
        "docType": "proforma",
        "docNumber": "PF 2024/001",
        "totals": { "gross": 1230.50, ... },
        "needsReview": false
      }
    }
  ]
}
```

### 2. Multi-page Invoice
**Goal**: Verify lines are extracted across pages and merged properly.

**Checks**:
- `lines.length` should be > 0.
- `totals.net` should match sum of lines (approx).

### 3. Foreign Invoice (ES/IT)
**Goal**: Verify "Fattura" or "Factura" maps to `invoice`.

**Checks**:
- `docType`: `invoice`
- `currency`: `EUR`
- `entities.supplier.name`: Should be extracted.

## Troubleshooting
- **No Text Extracted**: If `needsReview: true` and `reason: "No text extracted"`, the PDF is likely an image scan. V2 Phase 1 does not support OCR.
- **Validation Errors**: Check `reviewReason` in the response.
