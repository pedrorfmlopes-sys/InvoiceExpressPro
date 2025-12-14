# Runtime Process Flow

## Extract Endpoint Test
**Request**: `POST /api/extract?project=default`
**Files**: `invoice_with_bad_number.pdf`, `invoice_sample.pdf`

## Scenario 1: AI Extraction (Standard)
- **Result**:
    ```json
    {
        "docType": "Fatura-Recibo",
        "docNumber": "FR 2023/99",
        "total": 150.50,
        "extractionMethod": "ai",
        "confidence": 0.9
    }
    ```

## Scenario 2: Quality Gate & Recovery
- **AI Initial Output**: `docNumber: "1"` (Invalid, too short)
- **Action**: Cleared docNumber.
- **Regex Fallback Triggered**:
    - Pattern found: `000045/A` in text.
- **Recovered Result**:
    ```json
    {
        "docType": "Fatura",
        "docNumber": "000045/A",
        "total": 120.00,
        "extractionMethod": "ai", 
        "confidence": 0.9,
        "notes": "Recovered via Regex"
    }
    ```

## Scenario 3: AI Reprompt
- **AI Output**: `docNumber: null`
- **Regex**: Failed.
- **Action**: Reprompting specialized AI task...
- **Result**: `docNumber: "FT 2025/123"`

## Scenario 4: Scanned PDF
- **Method**: `regex` (needsOcr=true)
- **Result**: `docNumber: "SCAN/OCR REQUIRED"`
